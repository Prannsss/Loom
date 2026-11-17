/**
 * Loom AI-detection engine (isomorphic: runs in the browser and on the server).
 *
 * Pipeline, modelled on how commercial detectors report results
 * ("N% of this text appears AI-generated" + highlighted passages):
 *
 *   1. segment   – normalise extracted PDF/DOCX text, rebuild paragraphs,
 *                  drop headings, captions, page numbers and the reference list.
 *   2. evidence  – per paragraph: AI-writing pattern hits (lib/detect/patterns)
 *                  and stylometry (sentence-length burstiness, vocabulary).
 *   3. classify  – paragraphs are grouped into ~120–380-word blocks and scored
 *                  by a transformer classifier (browser, see classifier.ts) and,
 *                  optionally, by an LLM. Both are passed in as inputs here.
 *   4. fuse      – combine the signals per paragraph into a probability.
 *   5. report    – share of prose words in paragraphs above the threshold,
 *                  plus a word-weighted overall likelihood.
 *
 * No detector is proof of authorship. Scores are probabilities, and formal
 * human writing (academic, legal, non-native English) can score high.
 */

import { findPatterns, type PatternHit } from "./patterns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SegmentKind = "prose" | "heading" | "skipped";

export type Segment = {
  id: number;
  kind: SegmentKind;
  text: string;
  words: number;
  /** why a non-prose segment was skipped */
  reason?: string;
};

export type Block = {
  id: number;
  segmentIds: number[];
  text: string;
  words: number;
  /** ≤ ~340-word slices fed to the classifier (scores are averaged) */
  windows: string[];
};

export type SegmentEvidence = {
  patternScore: number; // 0..1
  styleScore: number; // 0..1
  hits: PatternHit[];
};

export type SegmentResult = Segment & {
  /** fused AI probability 0..100, null for non-prose */
  score: number | null;
  isAI: boolean;
  classifier?: number; // 0..1
  llm?: number; // 0..1
  llmReason?: string;
  evidence?: SegmentEvidence;
};

export type DocumentReport = {
  /** % of analysed prose words that sit in AI-flagged paragraphs (Grammarly-style headline) */
  aiShare: number;
  /** word-weighted mean probability across prose paragraphs, 0..100 */
  overall: number;
  verdict: "likely-human" | "mixed" | "likely-ai" | "insufficient";
  analysedWords: number;
  skippedWords: number;
  segments: SegmentResult[];
  topPatterns: { name: string; section: string; count: number }[];
  stats: {
    sentences: number;
    meanSentenceLen: number;
    sentenceLenCV: number;
    mattr: number;
    aiWordsPer1k: number;
    dashesPer1k: number;
  };
  signals: { classifier: boolean; llm: boolean };
  notes: string[];
};

export const AI_THRESHOLD = 0.5;
const MIN_WORDS_FOR_VERDICT = 80;

// ---------------------------------------------------------------------------
// 1. Segmentation
// ---------------------------------------------------------------------------

const countWords = (s: string) => (s.match(/[A-Za-zÀ-ÿ0-9'’-]+/g) ?? []).length;

const HEADING_WORDS =
  /^(?:(?:chapter|part|section)\s+[ivxlcdm\d]+.*|table\s+of\s+contents|contents|title\s+page|approval\s+sheet|acknowledge?ments?|dedication|abstract|list\s+of\s+(?:tables|figures|appendices)|introduction|background\s+of\s+the\s+study|statement\s+of\s+the\s+problem|research\s+questions?|objectives?(?:\s+of\s+the\s+study)?|scope\s+and\s+(?:delimitations?|limitations?)|significance\s+of\s+the\s+study|definition\s+of\s+terms|review\s+of\s+related\s+literature.*|conceptual\s+framework|theoretical\s+framework|methodology|research\s+design|results(?:\s+and\s+discussion)?|discussion|summary(?:\s+of\s+findings)?|findings|conclusions?|recommendations?|appendi(?:x|ces).*|curriculum\s+vitae)$/i;
const REFERENCE_HEADING = /^(?:\d+(?:\.\d+)*\.?\s*)?(?:references|bibliography|works\s+cited|literature\s+cited)\s*:?$/i;

/** Clean up text extracted from PDF/DOCX and rebuild real paragraphs. */
export function normalise(raw: string): string {
  let t = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/[​﻿]/g, "");
  // de-hyphenate words broken across PDF lines: "infor-\nmation" -> "information"
  t = t.replace(/([a-z])-\n([a-z])/g, "$1$2");
  const lines = t.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim());

  // Pasted text often uses one line per paragraph and no blank lines.
  const nonEmpty = lines.filter(Boolean);
  const hasBlankLines = lines.some((l, i) => !l && i > 0 && i < lines.length - 1);
  const avgLen = nonEmpty.reduce((a, l) => a + l.length, 0) / Math.max(nonEmpty.length, 1);
  const linePerParagraph = !hasBlankLines && avgLen > 150;

  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    const looksStandalone =
      HEADING_WORDS.test(line.replace(/^[\d.\s]+/, "").replace(/[:.]$/, "")) ||
      REFERENCE_HEADING.test(line) ||
      /^(?:\d+|[ivxlcdm]+|page\s+\d+(?:\s+of\s+\d+)?)$/i.test(line) ||
      /^[-•*●▪◦]\s+/.test(line);
    if (looksStandalone || linePerParagraph) {
      flush();
      if (looksStandalone) out.push(line);
      else buf = line;
      continue;
    }
    buf = buf ? buf + " " + line : line;
  }
  flush();
  return out.join("\n\n");
}

/** Split normalised text into paragraphs and classify each. */
export function segment(raw: string): Segment[] {
  const paras = normalise(raw)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const segs: Segment[] = [];
  let inReferences = false;
  paras.forEach((text, i) => {
    const words = countWords(text);
    const base = { id: i, text, words };
    const bare = text.replace(/^[\d.\s]+/, "").replace(/[:.]$/, "");

    if (REFERENCE_HEADING.test(text)) {
      inReferences = true;
      segs.push({ ...base, kind: "heading" });
      return;
    }
    if (inReferences) {
      // a new chapter-style heading ends the reference list
      if (/^(?:appendi(?:x|ces)|chapter\s)/i.test(bare)) inReferences = false;
      else {
        segs.push({ ...base, kind: "skipped", reason: "Reference list" });
        return;
      }
    }
    if (HEADING_WORDS.test(bare) || (words <= 12 && !/[.!?]["”]?$/.test(text))) {
      segs.push({ ...base, kind: "heading" });
      return;
    }
    if (/^(?:figure|fig\.|table|chart|graph)\s*\d+/i.test(text) && words < 40) {
      segs.push({ ...base, kind: "skipped", reason: "Caption" });
      return;
    }
    const digits = (text.match(/\d/g) ?? []).length;
    if (digits / Math.max(text.length, 1) > 0.25) {
      segs.push({ ...base, kind: "skipped", reason: "Table / numeric data" });
      return;
    }
    if (/^[A-Z][^.]{2,80}\(\d{4}[a-z]?\)\.|https?:\/\/|doi:\s*10\./i.test(text) && words < 60) {
      segs.push({ ...base, kind: "skipped", reason: "Citation" });
      return;
    }
    if (words < 8) {
      segs.push({ ...base, kind: "heading" });
      return;
    }
    segs.push({ ...base, kind: "prose" });
  });
  return segs;
}

const ABBREV = /\b(?:e\.g|i\.e|et al|etc|vs|Dr|Mr|Mrs|Ms|Prof|Fig|No|Vol|pp|cf|Inc|Ltd|Jr|Sr|St|approx)\.$/i;

export function splitSentences(p: string): string[] {
  const parts = p.split(/(?<=[.!?]["”’)]?)\s+(?=["“(]?[A-Z0-9])/);
  const out: string[] = [];
  for (const s of parts) {
    if (out.length && (ABBREV.test(out[out.length - 1]) || /\b[A-Z]\.$/.test(out[out.length - 1]))) {
      out[out.length - 1] += " " + s;
    } else out.push(s);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 2. Evidence: patterns + stylometry
// ---------------------------------------------------------------------------

/** Moving-average type–token ratio (length-robust lexical diversity). */
export function mattr(tokens: string[], win = 50): number {
  if (tokens.length === 0) return 0;
  if (tokens.length <= win) return new Set(tokens).size / tokens.length;
  let sum = 0;
  let n = 0;
  for (let i = 0; i + win <= tokens.length; i += 5) {
    sum += new Set(tokens.slice(i, i + win)).size / win;
    n++;
  }
  return sum / n;
}

function cv(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return m ? Math.sqrt(v) / m : 0;
}

/** Pattern evidence → 0..1. Weak-alone patterns count only alongside a strong one. */
export function patternEvidence(text: string, words: number): { score: number; hits: PatternHit[] } {
  const hits = findPatterns(text);
  // Weak-alone tells count next to a strong tell, or when several mild AI words cluster.
  const mild = hits.filter((h) => h.id === "ai-word-mild").length;
  const hasStrong = hits.some((h) => !h.weak) || mild >= 2;
  let triads = 0;
  let total = 0;
  const counted: PatternHit[] = [];
  for (const h of hits) {
    if (h.weak && !hasStrong) continue;
    if (h.id === "triad" && ++triads > 2) continue; // cap rhythm evidence
    total += h.weight;
    counted.push(h);
  }
  // weight per 100 words, saturating. ~3 strong hits in 100 words → ~0.8
  const density = (total / Math.max(words, 40)) * 100;
  const score = 1 - Math.exp(-density / 4);
  return { score, hits: counted };
}

/** Rhythm evidence: AI prose has unusually even sentence lengths. 0..1 */
export function styleEvidence(sentences: string[]): number {
  if (sentences.length < 4) return 0;
  const lens = sentences.map(countWords);
  const c = cv(lens);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const even = Math.min(1, Math.max(0, (0.42 - c) / 0.22)); // CV ≤0.20 → 1, ≥0.42 → 0
  const mid = mean >= 14 && mean <= 30 ? 1 : 0.5; // LLM sweet spot
  return even * mid;
}

// ---------------------------------------------------------------------------
// 3. Blocks for the classifier / LLM
// ---------------------------------------------------------------------------

/**
 * Group prose into classifier blocks. A paragraph of ≥ minWords is its own
 * block (mixing a human and an AI paragraph in one block contaminates both
 * scores); shorter paragraphs are merged with neighbours inside the same
 * section. Blocks longer than the model's 512-token window are split into
 * windows whose scores are averaged.
 */
export function buildBlocks(segs: Segment[], minWords = 60, windowWords = 340): Block[] {
  const blocks: Block[] = [];
  let cur: Segment[] = [];
  const curWords = () => cur.reduce((a, s) => a + s.words, 0);
  const push = (group: Segment[]) => {
    if (!group.length) return;
    const text = group.map((s) => s.text).join("\n\n");
    const words = group.reduce((a, s) => a + s.words, 0);
    blocks.push({ id: blocks.length, segmentIds: group.map((s) => s.id), text, words, windows: windowsOf(text, windowWords) });
  };
  for (const s of segs) {
    if (s.kind !== "prose") {
      if (s.kind === "heading") {
        // section break: attach leftovers to the previous block of the same section if tiny
        push(cur);
        cur = [];
      }
      continue;
    }
    if (s.words >= minWords) {
      if (cur.length) {
        push(cur);
        cur = [];
      }
      push([s]);
    } else {
      cur.push(s);
      if (curWords() >= minWords) {
        push(cur);
        cur = [];
      }
    }
  }
  push(cur);
  return blocks;
}

function windowsOf(text: string, size: number): string[] {
  const words = text.split(/\s+/);
  if (words.length <= size * 1.25) return [text];
  const n = Math.ceil(words.length / size);
  const per = Math.ceil(words.length / n);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(" "));
  return out;
}

// ---------------------------------------------------------------------------
// 4. Fusion
// ---------------------------------------------------------------------------

const logit = (p: number) => {
  const q = Math.min(0.995, Math.max(0.005, p));
  return Math.log(q / (1 - q));
};
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Combine signals in log-odds space.
 *
 * The classifier is strong on typical chatbot prose, but it also fires on
 * formal human prose (encyclopedic, academic). Pattern/rhythm evidence
 * rarely fires on those, so heuristics pull a lone classifier hit back
 * toward 50% and push it up when they corroborate.
 */
export function fuse(p: { classifier?: number; llm?: number; pattern: number; style: number }): number {
  // Coefficients hand-tuned on a small labelled set (pre-2022 arXiv/Wikipedia
  // human text vs. chatbot-style text): a lone classifier hit on clean,
  // formal prose lands in the 35–50 "possibly AI" band instead of being flagged.
  let x = 5.5 * (p.pattern - 0.2) + 0.4 * (p.style - 0.3);
  const hasModel = p.classifier !== undefined || p.llm !== undefined;
  if (p.classifier !== undefined) x += 0.6 * Math.max(-3.5, Math.min(3.5, logit(p.classifier)));
  if (p.llm !== undefined) x += 0.5 * Math.max(-3, Math.min(3, logit(p.llm)));
  return sigmoid(x + (hasModel ? -1.2 : -0.6));
}

export const POSSIBLE_THRESHOLD = 0.35;

// ---------------------------------------------------------------------------
// 5. Report
// ---------------------------------------------------------------------------

export type ExternalScores = {
  /** block id → AI probability from the transformer classifier */
  classifier?: Map<number, number>;
  /** segment id → AI probability (0..1) and short reason from the LLM */
  llm?: Map<number, { p: number; reason?: string }>;
};

export function analyse(raw: string, ext: ExternalScores = {}, preSegmented?: Segment[], blocks?: Block[]): DocumentReport {
  const segs = preSegmented ?? segment(raw);
  const blks = blocks ?? buildBlocks(segs);
  const blockOf = new Map<number, number>();
  for (const b of blks) for (const sid of b.segmentIds) blockOf.set(sid, b.id);

  const allSentLens: number[] = [];
  const allTokens: string[] = [];
  let aiWordHits = 0;
  let dashes = 0;
  const patternCounts = new Map<string, { name: string; section: string; count: number }>();

  const results: SegmentResult[] = segs.map((s) => {
    if (s.kind !== "prose") return { ...s, score: null, isAI: false };
    const sentences = splitSentences(s.text);
    sentences.forEach((x) => allSentLens.push(countWords(x)));
    allTokens.push(...(s.text.toLowerCase().match(/[a-z']+/g) ?? []));

    const pe = patternEvidence(s.text, s.words);
    // rhythm is measured on the whole block when the paragraph is short
    const bId = blockOf.get(s.id);
    const blockText = bId !== undefined ? blks[bId].text : s.text;
    const style = styleEvidence(sentences.length >= 4 ? sentences : splitSentences(blockText));

    for (const h of findPatterns(s.text)) {
      if (h.id.startsWith("ai-word")) aiWordHits++;
      if (h.id === "dash") dashes++;
    }
    for (const h of pe.hits) {
      const k = h.id;
      const e = patternCounts.get(k) ?? { name: h.name, section: h.section, count: 0 };
      e.count++;
      patternCounts.set(k, e);
    }

    const classifier = bId !== undefined ? ext.classifier?.get(bId) : undefined;
    const llmEntry = ext.llm?.get(s.id);
    const p = fuse({ classifier, llm: llmEntry?.p, pattern: pe.score, style });
    return {
      ...s,
      score: Math.round(p * 100),
      isAI: p >= AI_THRESHOLD,
      classifier,
      llm: llmEntry?.p,
      llmReason: llmEntry?.reason,
      evidence: { patternScore: pe.score, styleScore: style, hits: pe.hits },
    };
  });

  const prose = results.filter((r) => r.kind === "prose");
  const analysedWords = prose.reduce((a, r) => a + r.words, 0);
  const skippedWords = results.filter((r) => r.kind !== "prose").reduce((a, r) => a + r.words, 0);
  const aiWords = prose.filter((r) => r.isAI).reduce((a, r) => a + r.words, 0);
  const overall = analysedWords
    ? prose.reduce((a, r) => a + (r.score ?? 0) * r.words, 0) / analysedWords
    : 0;
  const aiShare = analysedWords ? (aiWords / analysedWords) * 100 : 0;

  const notes: string[] = [];
  let verdict: DocumentReport["verdict"];
  if (analysedWords < MIN_WORDS_FOR_VERDICT) {
    verdict = "insufficient";
    notes.push(`Only ${analysedWords} words of prose found; results under ${MIN_WORDS_FOR_VERDICT} words are unreliable.`);
  } else if (aiShare >= 60) verdict = "likely-ai";
  else if (aiShare >= 20) verdict = "mixed";
  else verdict = "likely-human";

  if (!ext.classifier) notes.push("Transformer classifier was not used; heuristics alone under-detect clean AI text.");
  if (skippedWords > 0) notes.push(`${skippedWords} words of headings, captions, tables and references were excluded.`);

  const meanLen = allSentLens.length ? allSentLens.reduce((a, b) => a + b, 0) / allSentLens.length : 0;
  return {
    aiShare: Math.round(aiShare),
    overall: Math.round(overall),
    verdict,
    analysedWords,
    skippedWords,
    segments: results,
    topPatterns: [...patternCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    stats: {
      sentences: allSentLens.length,
      meanSentenceLen: Math.round(meanLen * 10) / 10,
      sentenceLenCV: Math.round(cv(allSentLens) * 100) / 100,
      mattr: Math.round(mattr(allTokens) * 100) / 100,
      aiWordsPer1k: analysedWords ? Math.round((aiWordHits / analysedWords) * 10000) / 10 : 0,
      dashesPer1k: analysedWords ? Math.round((dashes / analysedWords) * 10000) / 10 : 0,
    },
    signals: { classifier: !!ext.classifier, llm: !!ext.llm },
    notes,
  };
}
