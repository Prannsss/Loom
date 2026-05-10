"use client";

import { useState, useRef } from "react";
import {
  UploadCloud, AlertCircle, Sparkles, Languages,
  Settings2, RefreshCw, ChevronDown, ChevronUp,
  Maximize2, X, Terminal, Copy, Check
} from "lucide-react";
import { extractTextFromFile } from "@/app/actions/extract";
import {
  pyDetectPreprocessing,
  llmDetectSemantic,
  fuseDetection,
  pyHumanizeLayer,
  llmHumanize,
} from "@/app/actions/ai";
import { DiffViewer } from "@/components/diff-viewer";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type Fragment = { text: string; score?: number; isAI: boolean };

type DetectionResult = {
  score: number;
  isAI: boolean;
  indicators: string[];
  explanation: string;
  fragments?: Fragment[];
};

type HumanizeResult = {
  humanizedText: string;
  summaryOfChanges: string;
};

type LogEntry = {
  message: string;
  timestamp: number;
  status: "pending" | "success" | "warning" | "error" | "info";
};

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const TONES = ["Professional", "Conversational", "Academic", "Casual", "No writing pattern"] as const;
type Tone = (typeof TONES)[number];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function getFragmentClass(frag: Fragment): string {
  if (!frag.text.trim()) return "bg-transparent";
  if (frag.score !== undefined) {
    if (frag.score > 70) return "bg-yellow-300/80 text-yellow-900";
    if (frag.score > 30) return "bg-yellow-100/80 text-yellow-900";
    return "bg-green-100/80 text-green-900";
  }
  return frag.isAI ? "bg-yellow-300/80 text-yellow-900" : "bg-green-100/80 text-green-900";
}

// ---------------------------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------------------------

function LogPanel({ logs, isActive }: { logs: LogEntry[]; isActive: boolean }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3 min-h-[180px] max-h-[300px] overflow-hidden">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        <Terminal className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest font-sans">Execution Logs</span>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-[10px] flex flex-col gap-1.5 pr-1">
        {logs.map((l, i) => (
          <div key={i} className="flex gap-2 leading-relaxed animate-in fade-in slide-in-from-bottom-1">
            <span className="text-slate-600 shrink-0">
              [{new Date(l.timestamp).toISOString().substr(11, 8)}]
            </span>
            <span
              className={cn(
                "break-words",
                l.status === "warning" ? "text-amber-400" :
                l.status === "error"   ? "text-red-400"   :
                l.status === "info"    ? "text-blue-400"  :
                "text-emerald-400"
              )}
            >
              {l.message}
            </span>
          </div>
        ))}
        {isActive && (
          <div className="flex gap-2">
            <span className="text-slate-600 shrink-0">[{new Date().toISOString().substr(11, 8)}]</span>
            <span className="text-emerald-400 animate-pulse">_</span>
          </div>
        )}
      </div>
    </div>
  );
}

function GaugeCard({ score }: { score: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const humanScore = 100 - score;
  const aiDash = (C * score) / 100;
  const humanDash = C - aiDash;
  const aiAngle = (score / 100) * 360;
  const aiColor = score > 70 ? "#ef4444" : score > 40 ? "#f97316" : "#f59e0b";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center gap-3">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Analysis Result</span>

      <div className="relative w-[120px] h-[120px] flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} stroke="#f1f5f9" strokeWidth="10" fill="transparent" />
          <circle
            cx="60" cy="60" r={R}
            stroke="#10b981" strokeWidth="10" fill="transparent"
            strokeLinecap="butt"
            strokeDasharray={`${humanDash} ${C}`}
            strokeDashoffset={0}
            style={{
              transform: `rotate(${aiAngle}deg)`,
              transformOrigin: "60px 60px",
              transition: "stroke-dasharray 0.9s ease-in-out, transform 0.9s ease-in-out",
            }}
          />
          <circle
            cx="60" cy="60" r={R}
            stroke={aiColor} strokeWidth="10" fill="transparent"
            strokeLinecap="butt"
            strokeDasharray={`${aiDash} ${C}`}
            strokeDashoffset={0}
            style={{ transition: "stroke-dasharray 0.9s ease-in-out" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center leading-none">
          <span className="text-2xl font-bold text-slate-800">{humanScore}%</span>
          <span className="text-[9px] font-bold mt-0.5 text-emerald-500">HUMAN</span>
        </div>
      </div>

      <div className="flex w-full gap-2">
        <div className="flex-1 flex flex-col items-center py-2 rounded-lg bg-red-50 border border-red-100">
          <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">AI</span>
          <span className="text-base font-bold text-red-600">{score}%</span>
        </div>
        <div className="flex-1 flex flex-col items-center py-2 rounded-lg bg-emerald-50 border border-emerald-100">
          <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Human</span>
          <span className="text-base font-bold text-emerald-600">{humanScore}%</span>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-slate-700 uppercase tracking-wider transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

export function MainPanel({ apiKey, modelType }: { apiKey: string; modelType: string }) {
  const [inputText, setInputText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isHumanizing, setIsHumanizing] = useState(false);

  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [humanizeResult, setHumanizeResult] = useState<HumanizeResult | null>(null);

  const [tone, setTone] = useState<Tone>("Professional");
  const [refinementContext, setRefinementContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Logging ──────────────────────────────────────────────────────────────

  const addLog = (message: string, status: LogEntry["status"] = "success") => {
    setLogs((prev) => [...prev, { message, timestamp: Date.now(), status }]);
  };

  // ── File upload ───────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await extractTextFromFile(formData);
      if (res.error) setError(res.error);
      else if (res.text) setInputText(res.text);
    } catch (err: any) {
      setError(err.message || "Failed to upload and extract file.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Analysis pipeline ─────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!inputText.trim()) { setError("Please input text to analyze."); return; }
    setError(null);
    setIsDetecting(true);
    setHumanizeResult(null);
    setLogs([]);

    let pipelineLog = "";

    try {
      addLog("Initializing Python NLP Engine...", "info");
      addLog("Loading document parser...", "pending");

      const pyData = await pyDetectPreprocessing(inputText);
      if (pyData.error) throw new Error(pyData.error);

      addLog("Running Python statistical analysis...", "success");
      addLog("Computing lexical diversity...", "pending");
      addLog("Computing entropy and burstiness...", "pending");
      pipelineLog += "1. Python Preprocessing: Cleaned academic sections.\n";
      pipelineLog += "2. Python Analysis: Computed baseline statistical metrics.\n";

      let llmResultData: any = null;

      addLog("Checking LLM configuration...", "info");

      if (apiKey) {
        addLog("LLM configuration found.", "success");
        addLog("Switching to Hybrid Mode.", "success");
        addLog("Sending structured content to LLM...", "pending");

        const llmRes = await llmDetectSemantic(pyData.filtered_text, modelType, apiKey);
        if (llmRes.result) {
          llmResultData = llmRes.result;
          addLog("Receiving semantic response...", "success");
          pipelineLog += "3. LLM Processing: Generated supplementary semantic signals.\n";
        } else {
          addLog("LLM processing failed, bypassing.", "warning");
          pipelineLog += "3. LLM Processing: Bypassed (unavailable or failed).\n";
        }
      } else {
        addLog("No LLM configuration found.", "warning");
        addLog("Switching to Python-only Mode.", "info");
        pipelineLog += "3. LLM Processing: Bypassed (no configuration).\n";
      }

      addLog("Finalizing AI probability score...", "pending");

      const finalRes = await fuseDetection(inputText, pyData, llmResultData, pipelineLog);
      if (finalRes.error) throw new Error(finalRes.error);

      setDetectionResult(finalRes.result);
      addLog(llmResultData ? "Analysis complete." : "Statistical analysis complete.", "success");

    } catch (err: any) {
      setError(err.message || "Analysis failed.");
      addLog("Pipeline execution failed.", "error");
    } finally {
      setIsDetecting(false);
    }
  };

  // ── Humanization pipeline ─────────────────────────────────────────────────

  const handleHumanize = async (isRefinement = false) => {
    if (!inputText.trim() || !detectionResult) { setError("Please analyze text first."); return; }
    setError(null);
    setIsHumanizing(true);
    setLogs([]);

    let pipelineLog = "";

    try {
      const textToHumanize =
        isRefinement && humanizeResult ? humanizeResult.humanizedText : inputText;

      addLog("Initializing Python NLP Engine...", "info");
      addLog("Applying deterministic humanization...", "pending");

      const pyRes = await pyHumanizeLayer(textToHumanize);
      if (pyRes.error) throw new Error(pyRes.error);

      addLog("Python humanization complete.", "success");
      pipelineLog +=
        "1. Python Layer: Applied sentence variation, contextual synonyms, contractions, and rhythm adjustments.\n";

      let finalHumanizedText: string = pyRes.python_humanized;
      let finalSummary = `${pipelineLog}\n[Python Only Mode] Humanized text without an LLM.`;

      addLog("Checking LLM configuration...", "info");

      if (apiKey) {
        addLog("LLM configuration found.", "success");
        addLog("Switching to Hybrid Mode.", "success");
        addLog("Sending to LLM for formatting...", "pending");

        const llmRes = await llmHumanize(
          finalHumanizedText,
          tone,
          isRefinement ? refinementContext : "",
          modelType,
          apiKey
        );

        if (llmRes.llmText) {
          finalHumanizedText = llmRes.llmText;
          pipelineLog += "2. LLM Layer: Improved structuring, formatting, and flow.\n";
          finalSummary =
            `${pipelineLog}\n[Hybrid Mode] AI Rewrite: ${llmRes.llmSummary ?? ""}`;
          addLog("Receiving formatting response...", "success");
        } else {
          addLog("LLM processing failed, bypassing.", "warning");
          pipelineLog += "2. LLM Layer: Bypassed.\n";
        }
      } else {
        addLog("No LLM configuration found.", "warning");
        addLog("Switching to Python-only Mode.", "info");
        pipelineLog += "2. LLM Layer: Bypassed (no configuration).\n";
      }

      setHumanizeResult({ humanizedText: finalHumanizedText, summaryOfChanges: finalSummary });
      addLog("Humanization complete.", "success");
      if (isRefinement) setRefinementContext("");

    } catch (err: any) {
      setError(err.message || "Humanization failed.");
      addLog("Pipeline execution failed.", "error");
    } finally {
      setIsHumanizing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const showLogs = isDetecting || isHumanizing || logs.length > 0;

  return (
    <>
      {/* Explanation modal */}
      {isExplanationOpen && detectionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
                Full Explanation
              </h2>
              <button
                onClick={() => setIsExplanationOpen(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="p-6 text-sm text-slate-600 leading-relaxed overflow-y-auto whitespace-pre-wrap">
              {detectionResult.explanation}
            </p>
          </div>
        </div>
      )}

      {/* Three-column layout */}
      <div className="flex flex-row gap-5 w-full h-full overflow-hidden">

        {/* ── LEFT PANEL ── */}
        <section className="w-[260px] shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Input & Analyze */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Input &amp; Analyze
            </span>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold flex flex-col items-center gap-1 hover:border-indigo-300 hover:text-indigo-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting}
            >
              {isExtracting
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <UploadCloud className="w-4 h-4" />}
              {isExtracting ? "UPLOADING..." : "UPLOAD PDF / DOCX"}
            </button>
            <button
              onClick={handleAnalyze}
              className="flex items-center justify-center w-full px-6 py-2.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
              disabled={isDetecting || !inputText.trim()}
            >
              {isDetecting
                ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {isDetecting ? "ANALYZING..." : "ANALYZE TEXT"}
            </button>
          </div>

          {/* Execution logs */}
          {showLogs && (
            <LogPanel logs={logs} isActive={isDetecting || isHumanizing} />
          )}

          {/* Detection results */}
          {detectionResult && !isDetecting && (
            <>
              <GaugeCard score={detectionResult.score} />

              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Analysis Indicators
                </h3>
                <div className="space-y-3">
                  {detectionResult.indicators.slice(0, 4).map((indicator, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <span
                        className="text-[11px] font-medium text-slate-700 truncate"
                        title={indicator}
                      >
                        {indicator}
                      </span>
                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            idx % 3 === 0 ? "bg-red-400 w-[90%]"    :
                            idx % 3 === 1 ? "bg-orange-400 w-[75%]" :
                                            "bg-indigo-400 w-[60%]"
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Explanation
                    </span>
                    <button
                      onClick={() => setIsExplanationOpen(true)}
                      className="flex items-center gap-1 text-[9px] font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-wider transition-colors"
                    >
                      <Maximize2 className="w-2.5 h-2.5" /> Expand
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">
                    {detectionResult.explanation}
                  </p>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── CENTER PANEL ── */}
        <section className="flex-grow flex flex-col gap-4 min-w-0 overflow-hidden">

          {error && (
            <div className="rounded-xl bg-red-50 p-3 flex gap-3 text-red-900 border border-red-200 shrink-0">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          {/* Main content area */}
          <div className="flex-grow min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {humanizeResult ? "Comparison View" : detectionResult ? "Original Input" : "Source Document"}
              </span>
              <div className="flex items-center gap-3">
                {humanizeResult && (
                  <CopyButton text={humanizeResult.humanizedText} />
                )}
                {detectionResult && (
                  <button
                    onClick={() => { setDetectionResult(null); setHumanizeResult(null); }}
                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-wider"
                  >
                    CLEAR &amp; EDIT
                  </button>
                )}
                <button
                  onClick={() => setIsInputCollapsed((v) => !v)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                  title={isInputCollapsed ? "Expand" : "Collapse"}
                >
                  {isInputCollapsed
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Body */}
            {!isInputCollapsed ? (
              <div className="flex-grow overflow-y-auto min-h-0">
                {!detectionResult ? (
                  <textarea
                    placeholder="Paste your text here or upload a document on the left to begin analysis..."
                    className="w-full h-full border-0 focus:outline-none resize-none p-5 text-sm font-sans text-slate-600 leading-relaxed bg-transparent"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={isExtracting}
                  />
                ) : !humanizeResult ? (
                  <div className="p-5 text-sm font-sans text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {detectionResult.fragments?.length ? (
                      detectionResult.fragments.map((frag, idx) => (
                        <span
                          key={idx}
                          className={cn("transition-colors rounded-[2px]", getFragmentClass(frag))}
                          title={
                            frag.score !== undefined && frag.text.trim()
                              ? `AI Probability: ${frag.score}%`
                              : ""
                          }
                        >
                          {frag.text}
                        </span>
                      ))
                    ) : (
                      <textarea
                        className="w-full h-full border-0 focus:outline-none resize-none text-sm font-sans text-slate-600 leading-relaxed bg-transparent"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    )}
                  </div>
                ) : (
                  <DiffViewer original={inputText} modified={humanizeResult.humanizedText} />
                )}
              </div>
            ) : (
              <div className="flex-grow flex items-center justify-center text-xs text-slate-400 italic gap-1 select-none">
                Content collapsed —
                <button
                  onClick={() => setIsInputCollapsed(false)}
                  className="text-indigo-500 font-semibold not-italic hover:underline"
                >
                  expand
                </button>
              </div>
            )}
          </div>

          {/* Action bar */}
          {detectionResult && (
            <div className="shrink-0 bg-white rounded-xl border border-slate-200 px-5 py-3 shadow-sm flex items-center justify-between">
              <div className="flex gap-5 items-center">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Input Length</span>
                  <span className="text-base font-bold text-slate-700">
                    {wordCount(inputText)} wds
                  </span>
                </div>
                <div className="w-px h-7 bg-slate-200" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Humanized</span>
                  <span className="text-base font-bold text-indigo-600">
                    {humanizeResult ? "YES" : "NO"}
                  </span>
                </div>
                {humanizeResult && (
                  <>
                    <div className="w-px h-7 bg-slate-200" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Output Length</span>
                      <span className="text-base font-bold text-emerald-600">
                        {wordCount(humanizeResult.humanizedText)} wds
                      </span>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => handleHumanize()}
                disabled={isHumanizing || !inputText.trim()}
                className="flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 shadow-md shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {isHumanizing && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                {isHumanizing ? "PROCESSING..." : humanizeResult ? "RE-HUMANIZE" : "HUMANIZE TEXT"}
              </button>
            </div>
          )}
        </section>

        {/* ── RIGHT PANEL ── */}
        <section className="w-[230px] shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Output tone */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm shrink-0">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Output Tone
            </h3>
            <div className="space-y-1.5">
              {TONES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs rounded-lg transition-colors",
                    tone === t
                      ? "font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200"
                      : "font-medium text-slate-600 border border-transparent hover:bg-slate-50"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Refinement / summary panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-4 flex-grow">
            {humanizeResult ? (
              <div className="flex flex-col gap-3 h-full">
                {/* Changes summary */}
                {humanizeResult.summaryOfChanges && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      Changes Summary
                    </span>
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-5">
                      {humanizeResult.summaryOfChanges}
                    </p>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-3 flex flex-col gap-3 flex-grow">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    Refinement Note
                  </label>
                  <textarea
                    placeholder="e.g. Make it shorter, use simpler words..."
                    className="w-full min-h-[80px] flex-grow p-3 text-xs resize-none rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={refinementContext}
                    onChange={(e) => setRefinementContext(e.target.value)}
                  />
                  <button
                    onClick={() => handleHumanize(true)}
                    disabled={isHumanizing || !refinementContext.trim()}
                    className="flex items-center justify-center w-full py-2.5 border border-slate-200 rounded-xl text-indigo-600 text-xs font-bold bg-indigo-50/50 hover:bg-indigo-100/50 hover:text-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {isHumanizing
                      ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                      : <Settings2 className="mr-2 h-3.5 w-3.5" />}
                    RE-APPLY TONE
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-center text-slate-400 py-8">
                <Languages className="w-7 h-7 mb-2 opacity-40" />
                <p className="text-xs px-2 leading-relaxed">
                  Humanize your text first to unlock refinement controls.
                </p>
              </div>
            )}
          </div>
        </section>

      </div>
    </>
  );
}