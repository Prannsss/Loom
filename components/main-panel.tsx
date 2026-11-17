"use client";

import { useMemo, useRef, useState } from "react";
import {
  UploadCloud, AlertCircle, Sparkles, Languages, Settings2, RefreshCw,
  Terminal, Copy, Check, FileText, Download, Info,
} from "lucide-react";
import { extractFile, ACCEPTED_EXTENSIONS } from "@/lib/extract";
import {
  analyse, buildBlocks, segment, AI_THRESHOLD, POSSIBLE_THRESHOLD,
  type DocumentReport, type SegmentResult, type Segment,
} from "@/lib/detect/engine";
import { classifyTexts } from "@/lib/detect/classifier";
import { mechanicalCleanup } from "@/lib/humanize/cleanup";
import { llmScoreParagraphs, llmHumanizeParagraphs } from "@/app/actions/ai";
import { DiffViewer } from "@/components/diff-viewer";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type LogEntry = { message: string; timestamp: number; status: "pending" | "success" | "warning" | "error" | "info" };

type HumanizeResult = {
  original: string;
  text: string;
  before: DocumentReport;
  after: DocumentReport | null;
  remaining: string[];
  mode: "llm" | "cleanup";
};

const TONES = ["Match original", "Academic", "Professional", "Conversational", "Casual"] as const;
type Tone = (typeof TONES)[number];

const LLM_DETECT_BATCH_CHARS = 7000;
const HUMANIZE_BATCH_WORDS = 1400;

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

function batchBy<T>(items: T[], size: (t: T) => number, max: number): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let n = 0;
  for (const it of items) {
    const s = size(it);
    if (cur.length && n + s > max) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(it);
    n += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

const VERDICT_LABEL: Record<DocumentReport["verdict"], string> = {
  "likely-human": "Mostly human-like",
  mixed: "Mixed signals",
  "likely-ai": "Mostly AI-like",
  insufficient: "Not enough text",
};

function scoreBand(score: number | null): "ai" | "possible" | "human" | "none" {
  if (score === null) return "none";
  if (score >= AI_THRESHOLD * 100) return "ai";
  if (score >= POSSIBLE_THRESHOLD * 100) return "possible";
  return "human";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LogPanel({ logs, isActive, progress }: { logs: LogEntry[]; isActive: boolean; progress: string }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3 min-h-[150px] max-h-[260px] overflow-hidden">
      <div className="flex items-center gap-2 text-slate-400">
        <Terminal className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Execution Logs</span>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-[10px] flex flex-col gap-1.5 pr-1 scrollbar-dark">
        {logs.map((l, i) => (
          <div key={i} className="flex gap-2 leading-relaxed">
            <span className="text-slate-600 shrink-0">[{new Date(l.timestamp).toISOString().substring(11, 19)}]</span>
            <span
              className={cn(
                "break-words",
                l.status === "warning" ? "text-amber-400" : l.status === "error" ? "text-red-400" : l.status === "info" ? "text-blue-400" : "text-emerald-400"
              )}
            >
              {l.message}
            </span>
          </div>
        ))}
        {isActive && <div className="text-emerald-400 animate-pulse">{progress || "_"}</div>}
      </div>
    </div>
  );
}

function ShareGauge({ report }: { report: DocumentReport }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const share = report.aiShare;
  const color = share >= 60 ? "#ef4444" : share >= 20 ? "#f97316" : "#10b981";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center gap-3">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Detection</span>
      <div className="relative w-[120px] h-[120px] flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} stroke="#f1f5f9" strokeWidth="10" fill="transparent" />
          <circle
            cx="60" cy="60" r={R} stroke={color} strokeWidth="10" fill="transparent"
            strokeDasharray={`${(C * share) / 100} ${C}`}
            style={{ transition: "stroke-dasharray 0.9s ease-in-out" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center leading-none">
          <span className="text-2xl font-bold text-slate-800">{share}%</span>
          <span className="text-[9px] font-bold mt-1 text-slate-400">OF TEXT</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-600 text-center leading-snug">
        <span className="font-semibold">{share}%</span> of your text appears AI-generated.
      </p>
      <div className="flex w-full gap-2">
        <div className="flex-1 flex flex-col items-center py-2 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Likelihood</span>
          <span className="text-sm font-bold text-slate-700">{report.overall}%</span>
        </div>
        <div className="flex-1 flex flex-col items-center py-2 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Verdict</span>
          <span className="text-[11px] font-bold text-slate-700 text-center">{VERDICT_LABEL[report.verdict]}</span>
        </div>
      </div>
      <div className="flex gap-1 text-[9px] font-semibold text-slate-400">
        <span className={cn("px-1.5 py-0.5 rounded", report.signals.classifier ? "bg-emerald-50 text-emerald-600" : "bg-slate-100")}>CLASSIFIER</span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">PATTERNS</span>
        <span className={cn("px-1.5 py-0.5 rounded", report.signals.llm ? "bg-emerald-50 text-emerald-600" : "bg-slate-100")}>LLM</span>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-wider"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Paragraph text with pattern matches underlined. */
function HighlightedText({ seg }: { seg: SegmentResult }) {
  const hits = (seg.evidence?.hits ?? []).slice().sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  hits.forEach((h, i) => {
    if (h.start < pos) return; // overlapping
    if (h.start > pos) parts.push(seg.text.slice(pos, h.start));
    parts.push(
      <span key={i} className="underline decoration-dotted decoration-red-400 underline-offset-2" title={`${h.section} ${h.name}`}>
        {seg.text.slice(h.start, h.end)}
      </span>
    );
    pos = h.end;
  });
  parts.push(seg.text.slice(pos));
  return <>{parts}</>;
}

function DocumentView({
  report, selected, onSelect,
}: { report: DocumentReport; selected: number | null; onSelect: (id: number) => void }) {
  return (
    <div className="p-5 flex flex-col gap-3 text-sm text-slate-700 leading-relaxed">
      {report.segments.map((s) => {
        if (s.kind === "heading") return <h4 key={s.id} className="font-semibold text-slate-800 pt-2">{s.text}</h4>;
        if (s.kind === "skipped")
          return (
            <p key={s.id} className="text-xs text-slate-400 italic border-l-2 border-slate-200 pl-3" title={`Not scored: ${s.reason}`}>
              {s.text.length > 220 ? s.text.slice(0, 220) + "…" : s.text}
            </p>
          );
        const band = scoreBand(s.score);
        return (
          <p
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              "rounded-md px-2 py-1 -mx-2 cursor-pointer transition-colors border",
              band === "ai" && "bg-amber-100/80 border-amber-200",
              band === "possible" && "bg-yellow-50 border-yellow-100",
              band === "human" && "border-transparent hover:bg-slate-50",
              selected === s.id && "ring-2 ring-indigo-400"
            )}
            title={`AI probability ${s.score}%`}
          >
            <HighlightedText seg={s} />
          </p>
        );
      })}
    </div>
  );
}

function SegmentDetail({ seg }: { seg: SegmentResult }) {
  const ev = seg.evidence;
  const row = (label: string, v: number | undefined) =>
    v === undefined ? null : (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 w-20 shrink-0">{label}</span>
        <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.round(v * 100)}%` }} />
        </div>
        <span className="text-[10px] font-mono text-slate-500 w-8 text-right">{Math.round(v * 100)}</span>
      </div>
    );
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected paragraph</span>
        <span className="text-xs font-bold text-slate-700">{seg.score}% AI</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {row("Classifier", seg.classifier)}
        {row("Patterns", ev?.patternScore)}
        {row("Rhythm", ev?.styleScore)}
        {row("LLM", seg.llm)}
      </div>
      {seg.llmReason && <p className="text-[11px] text-slate-500 italic">LLM: {seg.llmReason}</p>}
      {ev && ev.hits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {ev.hits.slice(0, 8).map((h, i) => (
            <li key={i} className="text-[11px] text-slate-600">
              <span className="font-mono text-[10px] text-slate-400 mr-1">{h.section}</span>
              {h.name}: <span className="italic">“{h.match.length > 50 ? h.match.slice(0, 50) + "…" : h.match}”</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MainPanel({ apiKey, modelType }: { apiKey: string; modelType: string }) {
  const [inputText, setInputText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isHumanizing, setIsHumanizing] = useState(false);

  const [report, setReport] = useState<DocumentReport | null>(null);
  const [humanized, setHumanized] = useState<HumanizeResult | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const [deepScan, setDeepScan] = useState(true);
  const [useLlm, setUseLlm] = useState(true);
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [tone, setTone] = useState<Tone>("Match original");
  const [notes, setNotes] = useState("");
  const [sample, setSample] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addLog = (message: string, status: LogEntry["status"] = "success") =>
    setLogs((prev) => [...prev, { message, timestamp: Date.now(), status }]);

  const selectedSeg = useMemo(
    () => report?.segments.find((s) => s.id === selected && s.kind === "prose") ?? null,
    [report, selected]
  );

  // ── Upload ───────────────────────────────────────────────────────────────

  const handleFile = async (file: File) => {
    setIsExtracting(true);
    setError(null);
    try {
      const res = await extractFile(file);
      if (!res.text.trim()) throw new Error("No selectable text found. Scanned PDFs (images) need OCR first.");
      setInputText(res.text);
      setFileName(file.name);
      setReport(null);
      setHumanized(null);
      setLogs([{ message: `Extracted ${wordCount(res.text).toLocaleString()} words from ${file.name}${res.pages ? ` (${res.pages} pages)` : ""}.`, timestamp: Date.now(), status: "success" }]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to read the file.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Detection ────────────────────────────────────────────────────────────

  /** Full detection pass. `withLlm` is false for the post-humanize re-scan. */
  const runDetection = async (text: string, withLlm: boolean): Promise<DocumentReport> => {
    const segs: Segment[] = segment(text);
    const blocks = buildBlocks(segs);
    const prose = segs.filter((s) => s.kind === "prose");
    addLog(`Segmented: ${prose.length} prose paragraphs, ${segs.length - prose.length} headings/skipped, ${blocks.length} blocks.`, "info");

    let classifier: Map<number, number> | undefined;
    if (deepScan && blocks.length) {
      try {
        addLog("Running transformer classifier in your browser...", "pending");
        const windows = blocks.flatMap((b) => b.windows.map((w) => ({ block: b.id, text: w })));
        const scores = await classifyTexts(windows.map((w) => w.text), (p) => {
          if (p.stage === "download") setProgress(`Downloading model (first run only): ${Math.round((p.loaded / Math.max(p.total, 1)) * 100)}%`);
          else setProgress(`Classifying passage ${p.done}/${p.total}`);
        });
        const sums = new Map<number, { s: number; n: number }>();
        windows.forEach((w, i) => {
          const e = sums.get(w.block) ?? { s: 0, n: 0 };
          sums.set(w.block, { s: e.s + scores[i], n: e.n + 1 });
        });
        classifier = new Map([...sums].map(([id, { s, n }]) => [id, s / n]));
        addLog("Classifier finished.");
      } catch (e: any) {
        addLog(`Classifier unavailable (${e?.message ?? e}). Continuing with patterns only.`, "warning");
      }
    }

    let llm: Map<number, { p: number; reason?: string }> | undefined;
    if (withLlm && useLlm && apiKey && prose.length) {
      addLog(`Asking ${modelType} for a per-paragraph second opinion...`, "pending");
      const batches = batchBy(prose, (s) => s.text.length, LLM_DETECT_BATCH_CHARS);
      llm = new Map();
      for (let i = 0; i < batches.length; i++) {
        setProgress(`LLM batch ${i + 1}/${batches.length}`);
        const r = await llmScoreParagraphs(batches[i].map((s) => ({ id: s.id, text: s.text })), modelType, apiKey);
        if (r.error) {
          addLog(`LLM layer skipped: ${r.error}`, "warning");
          llm = undefined;
          break;
        }
        for (const x of r.result ?? []) llm.set(x.id, { p: x.score / 100, reason: x.reason });
      }
      if (llm) addLog("LLM scoring finished.");
    } else if (withLlm && useLlm && !apiKey) {
      addLog("No API key: LLM second opinion skipped.", "info");
    }

    setProgress("");
    return analyse(text, { classifier, llm }, segs, blocks);
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) return setError("Paste text or upload a document first.");
    setError(null);
    setIsDetecting(true);
    setHumanized(null);
    setSelected(null);
    setLogs([]);
    try {
      const r = await runDetection(inputText, true);
      setReport(r);
      addLog(`Done: ${r.aiShare}% of ${r.analysedWords.toLocaleString()} analysed words appear AI-generated.`);
    } catch (e: any) {
      setError(e?.message ?? "Analysis failed.");
      addLog("Analysis failed.", "error");
    } finally {
      setIsDetecting(false);
      setProgress("");
    }
  };

  // ── Humanize ─────────────────────────────────────────────────────────────

  const handleHumanize = async (refine = false) => {
    const base = refine && humanized ? humanized.text : inputText;
    const baseReport = refine && humanized?.after ? humanized.after : report;
    if (!baseReport) return setError("Analyze the text first.");
    setError(null);
    setIsHumanizing(true);
    setLogs([]);
    try {
      const prose = baseReport.segments.filter((s) => s.kind === "prose");
      const targets = onlyFlagged && !refine ? prose.filter((s) => s.isAI) : prose;
      if (!targets.length) {
        addLog("No flagged paragraphs to rewrite. Untick 'Only flagged paragraphs' to rewrite everything.", "warning");
        return;
      }
      addLog(`Rewriting ${targets.length} of ${prose.length} paragraphs.`, "info");

      const rewritten = new Map<number, string>();
      let remaining: string[] = [];
      let mode: HumanizeResult["mode"] = "llm";

      if (apiKey) {
        const batches = batchBy(targets, (s) => s.words, HUMANIZE_BATCH_WORDS);
        for (let i = 0; i < batches.length; i++) {
          setProgress(`Humanizing batch ${i + 1}/${batches.length}`);
          const r = await llmHumanizeParagraphs(
            batches[i].map((s) => ({ id: s.id, text: s.text })),
            { tone, notes: refine ? notes : "", sample },
            modelType,
            apiKey
          );
          if (r.error) throw new Error(r.error);
          for (const p of r.result ?? []) rewritten.set(p.id, p.text);
          remaining = [...new Set([...remaining, ...(r.remaining ?? [])])];
        }
        addLog("LLM rewrite finished (humanizer skill).");
      } else {
        mode = "cleanup";
        addLog("No API key: applying mechanical cleanup only (dashes, stock phrases, chatbot residue).", "warning");
        for (const s of targets) rewritten.set(s.id, mechanicalCleanup(s.text));
      }

      const original = baseReport.segments.map((s) => s.text).join("\n\n");
      const text = baseReport.segments.map((s) => rewritten.get(s.id) ?? s.text).join("\n\n");

      addLog("Re-scanning the rewrite...", "pending");
      const after = await runDetection(text, false);
      addLog(`AI share: ${baseReport.aiShare}% → ${after.aiShare}%.`);

      setHumanized({ original, text, before: baseReport, after, remaining, mode });
      if (refine) setNotes("");
    } catch (e: any) {
      setError(e?.message ?? "Humanizing failed.");
      addLog("Humanizing failed.", "error");
    } finally {
      setIsHumanizing(false);
      setProgress("");
    }
  };

  const download = (text: string) => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (fileName?.replace(/\.[^.]+$/, "") ?? "loom") + "-humanized.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const busy = isDetecting || isHumanizing;
  const showLogs = busy || logs.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-row gap-5 w-full h-full overflow-hidden">
      {/* ── LEFT ── */}
      <section className="w-[270px] shrink-0 flex flex-col gap-4 overflow-y-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Input &amp; Analyze</span>
          <input
            type="file" aria-label="Upload document" accept={ACCEPTED_EXTENSIONS} className="hidden" ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button
            className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold flex flex-col items-center gap-1 hover:border-indigo-300 hover:text-indigo-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={isExtracting || busy}
          >
            {isExtracting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {isExtracting ? "READING..." : "UPLOAD PDF / DOCX / TXT"}
          </button>
          {fileName && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate" title={fileName}>
              <FileText className="w-3 h-3 shrink-0" /> {fileName}
            </div>
          )}

          <label className="flex items-start gap-2 text-[11px] text-slate-600 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={deepScan} onChange={(e) => setDeepScan(e.target.checked)} />
            <span>
              Deep scan with AI classifier
              <span className="block text-[10px] text-slate-400">Runs in your browser. ~126 MB model download on first use.</span>
            </span>
          </label>
          <label className={cn("flex items-start gap-2 text-[11px] cursor-pointer", apiKey ? "text-slate-600" : "text-slate-400")}>
            <input type="checkbox" className="mt-0.5" checked={useLlm && !!apiKey} disabled={!apiKey} onChange={(e) => setUseLlm(e.target.checked)} />
            <span>
              LLM second opinion
              <span className="block text-[10px] text-slate-400">{apiKey ? `Uses your ${modelType} key.` : "Add an API key in Settings."}</span>
            </span>
          </label>

          <button
            onClick={handleAnalyze}
            className="flex items-center justify-center w-full px-6 py-2.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
            disabled={busy || !inputText.trim()}
          >
            {isDetecting ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
            {isDetecting ? "ANALYZING..." : "CHECK FOR AI"}
          </button>
        </div>

        {showLogs && <LogPanel logs={logs} isActive={busy} progress={progress} />}

        {report && !isDetecting && (
          <>
            <ShareGauge report={humanized?.after ?? report} />
            {selectedSeg && <SegmentDetail seg={selectedSeg} />}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patterns found</h3>
              {report.topPatterns.length ? (
                <ul className="flex flex-col gap-1.5">
                  {report.topPatterns.map((p) => (
                    <li key={p.name} className="flex justify-between gap-2 text-[11px] text-slate-600">
                      <span><span className="font-mono text-[10px] text-slate-400 mr-1">{p.section}</span>{p.name}</span>
                      <span className="font-semibold">{p.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-400">No AI writing patterns found.</p>
              )}
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
                <span>Sentences: <b>{report.stats.sentences}</b></span>
                <span>Avg length: <b>{report.stats.meanSentenceLen}</b></span>
                <span>Length CV: <b>{report.stats.sentenceLenCV}</b></span>
                <span>Diversity: <b>{report.stats.mattr}</b></span>
                <span>AI words/1k: <b>{report.stats.aiWordsPer1k}</b></span>
                <span>Dashes/1k: <b>{report.stats.dashesPer1k}</b></span>
              </div>
              {report.notes.map((n, i) => (
                <p key={i} className="text-[10px] text-slate-400 leading-snug flex gap-1"><Info className="w-3 h-3 shrink-0 mt-px" />{n}</p>
              ))}
              <p className="text-[10px] text-slate-400 leading-snug border-t border-slate-100 pt-2">
                Scores are probabilities, not proof. Formal academic and non-native English writing can score high. Don&apos;t use this alone to judge someone&apos;s work.
              </p>
            </div>
          </>
        )}
      </section>

      {/* ── CENTER ── */}
      <section className="flex-grow flex flex-col gap-4 min-w-0 overflow-hidden">
        {error && (
          <div className="rounded-xl bg-red-50 p-3 flex gap-3 text-red-900 border border-red-200 shrink-0">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs font-medium">{error}</p>
          </div>
        )}

        <div className="flex-grow min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {humanized ? "Comparison View" : report ? "Detection Results" : "Source Document"}
            </span>
            <div className="flex items-center gap-3">
              {report && !humanized && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Likely AI
                  <span className="w-3 h-3 rounded bg-yellow-50 border border-yellow-100" /> Possibly AI (one signal)
                </div>
              )}
              {humanized && <CopyButton text={humanized.text} />}
              {humanized && (
                <button onClick={() => download(humanized.text)} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-wider">
                  <Download className="w-3 h-3" /> .txt
                </button>
              )}
              {report && (
                <button
                  onClick={() => { setReport(null); setHumanized(null); setSelected(null); }}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-wider"
                >
                  Edit text
                </button>
              )}
            </div>
          </div>

          <div className="flex-grow overflow-y-auto min-h-0 flex flex-col">
            {!report ? (
              <textarea
                placeholder="Paste your text here, or upload a PDF / DOCX on the left..."
                title="Input text"
                className="w-full h-full border-0 focus:outline-none resize-none p-5 text-sm text-slate-600 leading-relaxed bg-transparent"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isExtracting}
              />
            ) : !humanized ? (
              <DocumentView report={report} selected={selected} onSelect={setSelected} />
            ) : (
              <DiffViewer original={humanized.original} modified={humanized.text} />
            )}
          </div>
        </div>

        {report && (
          <div className="shrink-0 bg-white rounded-xl border border-slate-200 px-5 py-3 shadow-sm flex items-center justify-between gap-4">
            <div className="flex gap-5 items-center">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Analysed</span>
                <span className="text-base font-bold text-slate-700">{report.analysedWords.toLocaleString()} wds</span>
              </div>
              {humanized && (
                <>
                  <div className="w-px h-7 bg-slate-200" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">AI share</span>
                    <span className="text-base font-bold text-slate-700">
                      {humanized.before.aiShare}% → <span className="text-emerald-600">{humanized.after?.aiShare ?? "?"}%</span>
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              {!humanized && (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                  Only flagged paragraphs
                </label>
              )}
              <button
                onClick={() => handleHumanize(false)}
                disabled={busy}
                className="flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 shadow-md shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {isHumanizing && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                {isHumanizing ? "PROCESSING..." : humanized ? "RE-HUMANIZE" : "HUMANIZE"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── RIGHT ── */}
      <section className="w-[240px] shrink-0 flex flex-col gap-4 overflow-y-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm shrink-0">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Output Tone</h3>
          <div className="space-y-1.5">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs rounded-lg transition-colors",
                  tone === t ? "font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200" : "font-medium text-slate-600 border border-transparent hover:bg-slate-50"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-2 shrink-0">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your writing sample (optional)</label>
          <textarea
            placeholder="Paste a few paragraphs you wrote yourself. The rewrite matches its voice."
            className="w-full min-h-[90px] p-3 text-xs resize-y rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={sample}
            onChange={(e) => setSample(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3 flex-grow">
          {humanized ? (
            <>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                {humanized.mode === "llm" ? "Rewritten with the humanizer skill" : "Mechanical cleanup only"}
              </span>
              {humanized.remaining.length > 0 && (
                <p className="text-[11px] text-slate-500">Patterns the model could not remove: {humanized.remaining.join(", ")}</p>
              )}
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-t border-slate-100 pt-3">Refinement note</label>
              <textarea
                placeholder="e.g. Shorter sentences, keep the technical terms..."
                className="w-full min-h-[80px] flex-grow p-3 text-xs resize-none rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button
                onClick={() => handleHumanize(true)}
                disabled={busy || !notes.trim() || !apiKey}
                className="flex items-center justify-center w-full py-2.5 border border-slate-200 rounded-xl text-indigo-600 text-xs font-bold bg-indigo-50/50 hover:bg-indigo-100/50 transition-colors disabled:opacity-50"
              >
                {isHumanizing ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Settings2 className="mr-2 h-3.5 w-3.5" />}
                REFINE
              </button>
            </>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-center text-slate-400 py-8">
              <Languages className="w-7 h-7 mb-2 opacity-40" />
              <p className="text-xs px-2 leading-relaxed">
                Check your text, then humanize the flagged paragraphs. {apiKey ? "" : "Add an API key in Settings for full rewrites."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
