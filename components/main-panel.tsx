"use client";

import { useState, useRef } from "react";
import {
  UploadCloud, AlertCircle, Sparkles, Languages,
  Settings2, RefreshCw, ChevronDown, ChevronUp,
  Maximize2, X,
} from "lucide-react";
import { extractTextFromFile } from "@/app/actions/extract";
import { detectAIText, humanizeText } from "@/app/actions/ai";
import { DiffViewer } from "@/components/diff-viewer";
import { cn } from "@/lib/utils";

type DetectionResult = {
  score: number;
  isAI: boolean;
  indicators: string[];
  explanation: string;
  fragments?: { text: string; isAI: boolean }[];
};

type HumanizeResult = {
  humanizedText: string;
  summaryOfChanges: string;
};

export function MainPanel({ apiKey, modelType }: { apiKey: string; modelType: string }) {
  const [inputText, setInputText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isHumanizing, setIsHumanizing] = useState(false);

  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [humanizeResult, setHumanizeResult] = useState<HumanizeResult | null>(null);

  const [tone, setTone] = useState("Professional");
  const [refinementContext, setRefinementContext] = useState("");
  const [error, setError] = useState<string | null>(null);

  // UI collapse/expand state
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAnalyze = async () => {
    if (!inputText.trim()) { setError("Please input text to analyze."); return; }
    setError(null);
    setIsDetecting(true);
    setHumanizeResult(null);
    const res = await detectAIText(inputText, modelType, apiKey);
    if (res.error) setError(res.error);
    else if (res.result) setDetectionResult(res.result);
    setIsDetecting(false);
  };

  const handleHumanize = async (isRefinement = false) => {
    if (!inputText.trim() || !detectionResult) { setError("Please analyze text first."); return; }
    setError(null);
    setIsHumanizing(true);
    const textToHumanize = isRefinement && humanizeResult ? humanizeResult.humanizedText : inputText;
    const res = await humanizeText(textToHumanize, tone, isRefinement ? refinementContext : "", modelType, apiKey);
    if (res.error) setError(res.error);
    else if (res.result) {
      setHumanizeResult(res.result);
      if (isRefinement) setRefinementContext("");
    }
    setIsHumanizing(false);
  };

  // Dual-arc gauge maths — r=54, viewBox 120×120, cx=cy=60
  const R = 54;
  const C = 2 * Math.PI * R; // ≈ 339.3
  const score = detectionResult?.score ?? 0;
  const humanScore = 100 - score;
  const aiDash = (C * score) / 100;
  const humanDash = C - aiDash;
  const aiAngle = (score / 100) * 360;
  const aiColor = score > 70 ? "#ef4444" : score > 40 ? "#f97316" : "#f59e0b";

  return (
    <>
      {/* ── EXPLANATION MODAL ─────────────────────── */}
      {isExplanationOpen && detectionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Full Explanation</h2>
              <button onClick={() => setIsExplanationOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="p-6 text-sm text-slate-600 leading-relaxed overflow-y-auto">
              {detectionResult.explanation}
            </p>
          </div>
        </div>
      )}

      {/* ── THREE-COLUMN LAYOUT — fills the viewport ─ */}
      <div className="flex flex-row gap-5 w-full h-full overflow-hidden">

        {/* ── LEFT PANEL ──────────────────────────── */}
        <section className="w-[260px] shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Input & Analyze */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Input & Analyze</span>
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
              {isExtracting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              {isExtracting ? "UPLOADING..." : "UPLOAD PDF / DOCX"}
            </button>
            <button
              onClick={handleAnalyze}
              className="flex items-center justify-center w-full px-6 py-2.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
              disabled={isDetecting || !inputText.trim()}
            >
              {isDetecting ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {isDetecting ? "ANALYZING..." : "ANALYZE TEXT"}
            </button>
          </div>

          {/* AI Score + Indicators + Explanation */}
          {detectionResult && (
            <>
              {/* Dual-arc gauge */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Confidence Score</span>

                <div className="relative w-[120px] h-[120px] flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    {/* Track */}
                    <circle cx="60" cy="60" r={R} stroke="#f1f5f9" strokeWidth="10" fill="transparent" />
                    {/* Human arc (green) — rendered behind AI arc */}
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
                    {/* AI arc (red/orange) */}
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
                    <span className="text-2xl font-bold text-slate-800">{score}%</span>
                    <span className={cn("text-[9px] font-bold mt-0.5", detectionResult.isAI ? "text-red-500" : "text-emerald-500")}>
                      {detectionResult.isAI ? "AI DETECTED" : "HUMAN"}
                    </span>
                  </div>
                </div>

                {/* AI / Human percentage pills */}
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

              {/* Analysis Indicators + Explanation */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Analysis Indicators</h3>
                <div className="space-y-3">
                  {detectionResult.indicators.slice(0, 4).map((indicator, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-slate-700 truncate" title={indicator}>{indicator}</span>
                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full", idx % 3 === 0 ? "bg-red-400 w-[90%]" : idx % 3 === 1 ? "bg-orange-400 w-[75%]" : "bg-indigo-400 w-[60%]")} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Explanation — truncated with expand button */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Explanation</span>
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

        {/* ── CENTER PANEL ─────────────────────────── */}
        <section className="flex-grow flex flex-col gap-4 min-w-0 overflow-hidden">

          {error && (
            <div className="rounded-xl bg-red-50 p-3 flex gap-3 text-red-900 border border-red-200 shrink-0">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          {/* Source / Analysis / Diff view — grows to fill space */}
          <div className="flex-grow min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            {/* Collapsible header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {humanizeResult ? "Comparison View" : detectionResult ? "Original Input" : "Source Document"}
              </span>
              <div className="flex items-center gap-3">
                {detectionResult && (
                  <button
                    onClick={() => { setDetectionResult(null); setHumanizeResult(null); }}
                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-wider"
                  >
                    CLEAR & EDIT
                  </button>
                )}
                <button
                  onClick={() => setIsInputCollapsed(v => !v)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                  title={isInputCollapsed ? "Expand" : "Collapse"}
                >
                  {isInputCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Collapsible body */}
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
                    {detectionResult.fragments && detectionResult.fragments.length > 0
                      ? detectionResult.fragments.map((frag, idx) => (
                          <span key={idx} className={frag.isAI ? "bg-yellow-200 rounded px-0.5" : "bg-green-100 rounded px-0.5"}>
                            {frag.text}
                          </span>
                        ))
                      : <textarea
                          className="w-full h-full border-0 focus:outline-none resize-none text-sm font-sans text-slate-600 leading-relaxed bg-transparent"
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                        />
                    }
                  </div>
                ) : (
                  <DiffViewer original={inputText} modified={humanizeResult.humanizedText} />
                )}
              </div>
            ) : (
              <div className="flex-grow flex items-center justify-center text-xs text-slate-400 italic gap-1 select-none">
                Content collapsed —
                <button onClick={() => setIsInputCollapsed(false)} className="text-indigo-500 font-semibold not-italic hover:underline">expand</button>
              </div>
            )}
          </div>

          {/* Action Bar — always visible at bottom of center panel */}
          {detectionResult && (
            <div className="shrink-0 bg-white rounded-xl border border-slate-200 px-5 py-3 shadow-sm flex items-center justify-between">
              <div className="flex gap-5 items-center">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Input Length</span>
                  <span className="text-base font-bold text-slate-700">{inputText.split(/\s+/).filter(Boolean).length} wds</span>
                </div>
                <div className="w-px h-7 bg-slate-200" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Humanized</span>
                  <span className="text-base font-bold text-indigo-600">{humanizeResult ? "YES" : "NO"}</span>
                </div>
              </div>
              <button
                onClick={() => handleHumanize()}
                disabled={isHumanizing || !inputText.trim()}
                className="flex items-center justify-center px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 shadow-md shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {isHumanizing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isHumanizing ? "PROCESSING..." : "HUMANIZE TEXT"}
              </button>
            </div>
          )}
        </section>

        {/* ── RIGHT PANEL ──────────────────────────── */}
        <section className="w-[230px] shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Output Tone */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm shrink-0">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Output Tone</h3>
            <div className="space-y-1.5">
              {["Professional", "Conversational", "Academic", "Casual", "No writing pattern"].map((t) => (
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

          {/* Refinement panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col gap-4 flex-grow">

            {humanizeResult ? (
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Refinement Note</label>
                <textarea
                  placeholder="e.g. Make it shorter, use simpler words..."
                  className="w-full min-h-[80px] p-3 text-xs resize-none rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={refinementContext}
                  onChange={(e) => setRefinementContext(e.target.value)}
                />
                <button
                  onClick={() => handleHumanize(true)}
                  disabled={isHumanizing || !refinementContext.trim()}
                  className="flex items-center justify-center w-full py-2.5 border border-slate-200 rounded-xl text-indigo-600 text-xs font-bold bg-indigo-50/50 hover:bg-indigo-100/50 hover:text-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isHumanizing ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Settings2 className="mr-2 h-3.5 w-3.5" />}
                  RE-APPLY TONE
                </button>
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
