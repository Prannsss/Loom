/**
 * AI-writing pattern catalog.
 *
 * Sections §1–§25 follow the "humanizer" skill by blader
 * (https://github.com/blader/humanizer, MIT), which is itself based on
 * Wikipedia's "Signs of AI writing" (WikiProject AI Cleanup). The same
 * catalog drives both the detector (here) and the humanizer prompt
 * (lib/humanize/skill.ts), so what we flag is what we rewrite.
 *
 * weight: evidence strength for one sighting.
 * weak:   "weak alone" in the skill. Only counts when the same paragraph
 *         also has at least one non-weak hit.
 */

export type PatternCategory =
  | "Staging"
  | "Rhythm"
  | "Inflation"
  | "Formatting"
  | "Leftovers"
  | "Stock phrasing";

export type PatternDef = {
  id: string;
  section: string; // skill section, e.g. "§1"
  name: string;
  category: PatternCategory;
  weight: number;
  weak?: boolean;
  regex: RegExp; // must be global
};

const w = (words: string[]) => words.map((x) => x.replace(/ /g, "\\s+")).join("|");
const re = (src: string) => new RegExp(src, "gi");

export const PATTERNS: PatternDef[] = [
  // ── A. Staging instead of stating ────────────────────────────────────────
  {
    id: "not-x-but-y",
    section: "§1",
    name: "\"Not X but Y\" contrast",
    category: "Staging",
    weight: 2.2,
    regex: re(
      String.raw`\bnot\s+(?:just|only|merely|simply)\b[^.;!?]{1,90}?\bbut(?:\s+also|\s+rather)?\b` +
        String.raw`|\b(?:it|this|that)(?:'s|’s|\s+is|\s+was)\s+not\s+(?:just\s+|only\s+|merely\s+|about\s+)?[^.;!?]{1,60}?[,;:—–]\s*(?:it|this|that)(?:'s|’s|\s+is|\s+was)\b` +
        String.raw`|\b(?:isn't|isn’t|is\s+not|wasn't|wasn’t)\s+(?:just|only|merely)\b` +
        String.raw`|\b(?:this|that)\s+(?:does\s+not|doesn't|doesn’t)\s+mean\b[^.!?]{1,120}[.!?]\s+It\s+means\b`
    ),
  },
  {
    id: "closer",
    section: "§2",
    name: "One-line closer / dramatic fragment",
    category: "Staging",
    weight: 2.5,
    regex: re(
      w([
        "that is the real win",
        "that's the real win",
        "let that sink in",
        "read that again",
        "that distinction matters",
        "the message was clear",
        "and that matters",
        "this is where it gets interesting",
        "this shows the importance of",
        "this highlights the importance of",
        "this underscores the importance of",
        "it was a lesson in",
      ]) + String.raw`|\b(?:every|each)\.\s+single\.\s+\w+\.`
    ),
  },
  {
    id: "deep-saying",
    section: "§3",
    name: "Saying that sounds deep",
    category: "Staging",
    weight: 2,
    regex: re(
      String.raw`\b(?:` +
        w([
          "the real question is",
          "at its core",
          "at the heart of the matter",
          "the heart of the matter",
          "what really matters",
          "what truly matters",
          "the deeper issue",
          "in reality,",
          "fundamentally,",
        ]) +
        String.raw`)`
    ),
  },
  {
    id: "run-up",
    section: "§4",
    name: "Staged run-up before the point",
    category: "Staging",
    weight: 2.5,
    regex: re(
      String.raw`\b(?:` +
        w([
          "let's dive in",
          "let’s dive in",
          "let's dive into",
          "let’s dive into",
          "let's explore",
          "let’s explore",
          "let's break this down",
          "let's break it down",
          "let’s break this down",
          "here's what you need to know",
          "here’s what you need to know",
          "without further ado",
          "here's the thing",
          "here’s the thing",
          "let's be honest",
          "let’s be honest",
          "real talk",
          "now let's look at",
          "now, let's look at",
        ]) +
        String.raw`)\b|(?:^|[.!?]\s+)Honestly\?`
    ),
  },
  {
    id: "no-one",
    section: "§5",
    name: "Arguing with no one",
    category: "Staging",
    weight: 1.5,
    regex: re(
      String.raw`\b(?:` +
        w([
          "to be clear",
          "don't get me wrong",
          "don’t get me wrong",
          "this is not to say",
          "this isn't to say",
          "i'm not saying",
          "i’m not saying",
          "one might be tempted",
          "a tempting approach would be",
          "an obvious approach would be",
          "it would be easy to just",
        ]) +
        String.raw`)\b`
    ),
  },

  // ── B. Rhythm by rule ────────────────────────────────────────────────────
  {
    id: "triad",
    section: "§6",
    name: "Forced triad (X, Y, and Z)",
    category: "Rhythm",
    weight: 0.8,
    weak: true,
    regex: re(String.raw`\b[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2},\s+[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2},?\s+and\s+[a-z][\w-]*(?:\s+[a-z][\w-]*){0,2}\b`),
  },
  {
    id: "dash",
    section: "§8",
    name: "Em/en dash as connector",
    category: "Rhythm",
    weight: 0.6,
    weak: true,
    regex: /\s?[—–]\s?|\s--\s/g,
  },
  {
    id: "qualifiers",
    section: "§9",
    name: "Stacked qualifiers",
    category: "Rhythm",
    weight: 1,
    weak: true,
    regex: re(
      String.raw`\b(?:` +
        w([
          "could potentially",
          "might arguably",
          "may potentially",
          "could possibly",
          "might possibly",
          "it's also possible",
          "it is also possible",
          "to be fair",
          "in some cases it may",
        ]) +
        String.raw`)\b`
    ),
  },
  {
    id: "hyphen-pair",
    section: "§10",
    name: "Hyphenated pair after the noun",
    category: "Rhythm",
    weight: 0.5,
    weak: true,
    regex: re(
      String.raw`\b(?:is|are|was|were|be|been|remains|seems)\s+(?:` +
        "high-quality|well-known|well-documented|long-term|real-time|well-established|well-defined|cutting-edge|data-driven|user-friendly|state-of-the-art" +
        String.raw`)\b(?!\s+[a-z]+(?:s|ion|ment|ness)?\b)`
    ),
  },

  // ── C. Inflation and borrowed authority ──────────────────────────────────
  {
    id: "ai-word-strong",
    section: "§12",
    name: "Overused AI word",
    category: "Inflation",
    weight: 1.2,
    regex: re(
      String.raw`\b(?:delv(?:e|es|ed|ing)|tapestry|testament|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|pivotal|intricate|intricacies|meticulous(?:ly)?|vibrant|multifaceted|interplay|garner(?:s|ed|ing)?|bolster(?:s|ed|ing)?|enduring|realm|ever-evolving|ever-changing|seamless(?:ly)?|transformative|holistic|embark(?:s|ed|ing)?|resonat(?:e|es|ed|ing)|unwavering|invaluable|commendable|noteworthy|paramount|nuanced|navigat(?:e|es|ing)\s+the\s+complexit(?:y|ies)|deep\s+dive|game-changer|cutting-edge|unlock(?:s|ing)?\s+the\s+(?:potential|power))\b`
    ),
  },
  {
    id: "ai-word-mild",
    section: "§12",
    name: "Overused AI word (mild)",
    category: "Inflation",
    weight: 0.5,
    weak: true,
    regex: re(
      String.raw`\b(?:additionally|furthermore|moreover|crucial|foster(?:s|ed|ing)?|leverag(?:e|es|ed|ing)|landscape|robust|enhanc(?:e|es|ed|ing)|streamlin(?:e|es|ed|ing)|empower(?:s|ed|ing)?|comprehensive|valuable|align(?:s|ed)?\s+with|ultimately)\b`
    ),
  },
  {
    id: "inflated",
    section: "§13",
    name: "Inflated significance",
    category: "Inflation",
    weight: 2,
    regex: re(
      String.raw`\b(?:` +
        w([
          "stands as a testament",
          "serves as a testament",
          "a testament to",
          "a pivotal moment",
          "a crucial moment",
          "plays a key role",
          "plays a crucial role",
          "plays a vital role",
          "plays a pivotal role",
          "plays a significant role",
          "play a crucial role",
          "play a vital role",
          "play a key role",
          "play a pivotal role",
          "marking a pivotal",
          "underscores its importance",
          "reflects a broader",
          "lasting legacy",
          "enduring legacy",
          "setting the stage for",
          "evolving landscape",
          "indelible mark",
          "continues to thrive",
          "the future looks bright",
          "exciting times ahead",
          "a step in the right direction",
          "pave the way",
          "paves the way",
          "paving the way",
          "a significant milestone",
          "shape the future",
          "shaping the future",
        ]) +
        String.raw`)\b`
    ),
  },
  {
    id: "vague-link",
    section: "§14",
    name: "Vague connection",
    category: "Inflation",
    weight: 0.4,
    weak: true,
    regex: re(String.raw`\b(?:in association with|in connection with|is associated with|are associated with)\b`),
  },
  {
    id: "shallow-ing",
    section: "§15",
    name: "Shallow -ing phrase tacked on",
    category: "Inflation",
    weight: 1.5,
    regex: re(
      String.raw`,\s+(?:thereby\s+)?(?:highlighting|underscoring|emphasizing|emphasising|ensuring|reflecting|symbolizing|symbolising|contributing\s+to|cultivating|fostering|encompassing|showcasing|demonstrating|illustrating|making\s+it\s+(?:a|an)\s+(?:essential|ideal|valuable|vital))\b`
    ),
  },
  {
    id: "sales",
    section: "§16",
    name: "Sales language",
    category: "Inflation",
    weight: 1.2,
    regex: re(
      String.raw`\b(?:` +
        w([
          "rich cultural heritage",
          "rich history",
          "natural beauty",
          "nestled",
          "in the heart of",
          "groundbreaking",
          "renowned",
          "diverse array",
          "a wide array of",
          "breathtaking",
          "must-visit",
          "stunning",
          "commitment to excellence",
          "exemplifies",
          "profound",
        ]) +
        String.raw`)\b`
    ),
  },
  {
    id: "authority",
    section: "§17",
    name: "Borrowed authority",
    category: "Inflation",
    weight: 1,
    regex: re(
      String.raw`\b(?:experts\s+(?:argue|believe|say|suggest|agree|note)|observers\s+have|industry\s+reports|some\s+critics\s+argue|according\s+to\s+experts)\b`
    ),
  },
  {
    id: "copula-avoid",
    section: "§18",
    name: "Avoiding is/are/has (\"serves as\", \"boasts\")",
    category: "Inflation",
    weight: 1.2,
    regex: re(String.raw`\b(?:serves?\s+as|stands?\s+as|acts?\s+as\s+a\s+(?:catalyst|bridge|cornerstone)|boasts?|cornerstone\s+of)\b`),
  },

  // ── D. Formatting by rule ────────────────────────────────────────────────
  {
    id: "bold",
    section: "§19",
    name: "Bold as decoration",
    category: "Formatting",
    weight: 2,
    regex: /\*\*[^*\n]{2,60}\*\*|^\s*[-*•]\s+\*\*[^*]+:\*\*/gm,
  },
  {
    id: "emoji",
    section: "§20",
    name: "Decorative emoji / arrows",
    category: "Formatting",
    weight: 1.5,
    regex: /[\u{1F300}-\u{1FAFF}\u{2705}\u{2728}\u{274C}\u{2B50}]|→/gu,
  },

  // ── E. Leftovers from the chat and the draft ─────────────────────────────
  {
    id: "chatbot",
    section: "§22",
    name: "Chatbot residue",
    category: "Leftovers",
    weight: 4,
    regex: re(
      String.raw`\b(?:` +
        w([
          "i hope this helps",
          "great question",
          "you're absolutely right",
          "you’re absolutely right",
          "as an ai",
          "as a language model",
          "let me know if you",
          "would you like me to",
          "feel free to ask",
          "i'd be happy to",
          "i’d be happy to",
          "here is a revised",
          "here's a revised",
          "here is an overview",
          "here's an overview",
          "certainly! here",
          "of course! here",
        ]) +
        String.raw`)`
    ),
  },
  {
    id: "knowledge-limit",
    section: "§23",
    name: "Knowledge-limit disclaimer",
    category: "Leftovers",
    weight: 3,
    regex: re(
      String.raw`\b(?:` +
        w([
          "as of my last",
          "up to my last training",
          "my knowledge cutoff",
          "while specific details are limited",
          "not widely documented",
          "not extensively documented",
          "based on available information",
          "in the provided sources",
          "maintains a low profile",
        ]) +
        String.raw`)\b`
    ),
  },
  {
    id: "self-describe",
    section: "§25",
    name: "Writing about the document",
    category: "Leftovers",
    weight: 0.8,
    weak: true,
    regex: re(
      String.raw`\bthis\s+(?:essay|article|paper|section|chapter|study|report|research)\s+(?:will\s+)?(?:aims?\s+to|seeks?\s+to|will)\s+(?:explore|examine|delve|discuss|shed\s+light|provide\s+(?:an?\s+)?(?:overview|insight))`
    ),
  },

  // ── Stock phrasing (common LLM boilerplate not covered above) ────────────
  {
    id: "stock",
    section: "stock",
    name: "Stock AI phrasing",
    category: "Stock phrasing",
    weight: 1.5,
    regex: re(
      String.raw`\b(?:` +
        w([
          "in today's rapidly evolving",
          "in today’s rapidly evolving",
          "in today's fast-paced",
          "in today’s fast-paced",
          "in today's digital age",
          "in today’s digital age",
          "in today's world",
          "in today’s world",
          "in an increasingly",
          "in the ever-evolving",
          "in the realm of",
          "it is important to note",
          "it's important to note",
          "it is worth noting",
          "it's worth noting",
          "it is essential to",
          "it is crucial to",
          "shed light on",
          "sheds light on",
          "shedding light on",
          "a wide range of",
          "valuable insights",
          "provide insights into",
          "gain a deeper understanding",
          "a deeper understanding of",
          "navigate the complexities",
          "in conclusion,",
          "to sum up,",
          "overall, ",
          "by leveraging",
          "harness the power",
          "harnessing the power",
          "the importance of fostering",
          "meaningful collaboration",
          "while also",
          "both the benefits and challenges",
          "benefits and challenges",
          "unprecedented opportunities",
          "stay competitive",
          "remains to be seen",
          "for future generations",
          "the world we leave",
        ]) +
        String.raw`)`
    ),
  },
];

export type PatternHit = {
  id: string;
  section: string;
  name: string;
  category: PatternCategory;
  weight: number;
  weak: boolean;
  match: string;
  start: number; // offset inside the scanned text
  end: number;
};

/** Run every pattern over `text` and return the raw hits, sorted by position. */
export function findPatterns(text: string): PatternHit[] {
  const hits: PatternHit[] = [];
  for (const p of PATTERNS) {
    p.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(text)) !== null) {
      if (m[0].length === 0) {
        p.regex.lastIndex++;
        continue;
      }
      hits.push({
        id: p.id,
        section: p.section,
        name: p.name,
        category: p.category,
        weight: p.weight,
        weak: !!p.weak,
        match: m[0].trim(),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  // Drop a mild/stock hit fully covered by a stronger one (avoid double counting).
  hits.sort((a, b) => a.start - b.start || b.weight - a.weight);
  const kept: PatternHit[] = [];
  for (const h of hits) {
    const covered = kept.some((k) => k.start <= h.start && k.end >= h.end && k.weight >= h.weight && k.id !== h.id);
    if (!covered) kept.push(h);
  }
  return kept;
}
