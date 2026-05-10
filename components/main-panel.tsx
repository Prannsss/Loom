"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, AlertCircle, Sparkles, Languages, Settings2, RefreshCw } from "lucide-react";
// removed ui imports
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
      
      if (res.error) {
        setError(res.error);
      } else if (res.text) {
        setInputText(res.text);
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload and extract file.");
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      setError("Please input text to analyze.");
      return;
    }
    setError(null);
    setIsDetecting(true);
    setHumanizeResult(null);

    const res = await detectAIText(inputText, modelType, apiKey);
    if (res.error) {
      setError(res.error);
    } else if (res.result) {
      setDetectionResult(res.result);
    }
    setIsDetecting(false);
  };

  const handleHumanize = async (isRefinement = false) => {
    if (!inputText.trim() || !detectionResult) {
      setError("Please input text and analyze first.");
      return;
    }
    setError(null);
    setIsHumanizing(true);

    const textToHumanize = isRefinement && humanizeResult ? humanizeResult.humanizedText : inputText;
    
    const res = await humanizeText(textToHumanize, tone, isRefinement ? refinementContext : "", modelType, apiKey);
    
    if (res.error) {
      setError(res.error);
    } else if (res.result) {
      setHumanizeResult(res.result);
      if (isRefinement) {
        setRefinementContext("");
      }
    }
    setIsHumanizing(false);
  };

  // Geometric layout implementation
  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-full min-h-[calc(100vh-8rem)]">
      
      {/* LEFT PANEL: DETECTION ANALYSIS */}
      <section className="w-full lg:w-[280px] flex flex-col gap-6 shrink-0">
        
        {/* Analyze Block */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Input & Analyze</span>
          
          <div className="flex flex-col gap-3">
             <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button 
                  className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold flex flex-col items-center gap-1 hover:border-indigo-300 hover:text-indigo-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExtracting}
                >
                  {isExtracting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                  {isExtracting ? "UPLOADING..." : "UPLOAD PDF / DOCX"}
                </button>
              </div>
              <button 
                onClick={handleAnalyze} 
                className="flex items-center justify-center w-full px-6 py-2.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
                disabled={isDetecting || !inputText.trim()}
              >
                {isDetecting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {isDetecting ? "ANALYZING..." : "ANALYZE TEXT"}
              </button>
          </div>
        </div>

        {/* AI Confidence Score */}
        {detectionResult && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">AI Confidence Score</span>
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                  <circle 
                    cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" 
                    strokeDasharray="364" 
                    strokeDashoffset={364 - (364 * detectionResult.score) / 100} 
                    className="text-indigo-600 transition-all duration-1000 ease-in-out" 
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-3xl font-bold">{detectionResult.score}%</span>
                  <span className={cn("text-[10px] font-semibold", detectionResult.isAI ? "text-red-500" : "text-emerald-500")}>
                    {detectionResult.isAI ? "HIGH RISK" : "HUMAN"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex-grow">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Analysis Indicators</h3>
              <div className="space-y-4">
                {detectionResult.indicators.slice(0, 4).map((indicator, idx) => (
                   <div key={idx} className="flex flex-col gap-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="font-medium text-slate-700 truncate mr-2" title={indicator}>{indicator}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full", idx % 3 === 0 ? "bg-red-400 w-[90%]" : idx % 3 === 1 ? "bg-orange-400 w-[75%]" : "bg-indigo-400 w-[60%]")}
                        ></div>
                      </div>
                   </div>
                ))}
              </div>
              <p className="mt-6 text-[11px] text-slate-500 leading-relaxed max-h-24 overflow-y-auto">
                {detectionResult.explanation}
              </p>
            </div>
          </>
        )}
      </section>

      {/* CENTER PANEL: COMPARISON VIEW & INPUT */}
      <section className="flex-grow flex flex-col gap-6 min-w-0">
        
        {error && (
          <div className="rounded-xl bg-red-50 p-4 flex gap-3 text-red-900 border border-red-200">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {!detectionResult ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-grow flex flex-col overflow-hidden">
             <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Source Document</span>
             </div>
             <textarea
                placeholder="Paste your text here or upload a document on the left to begin analysis..."
                className="flex-grow border-0 focus-visible:ring-0 focus:outline-none resize-none p-6 text-sm font-sans text-slate-600 leading-relaxed bg-transparent"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isExtracting}
              />
          </div>
        ) : (
          <>
            {/* Diff Viewer or just source text if not humanized yet */}
             {!humanizeResult ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-grow flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original Input</span>
                    <button 
                      onClick={() => setDetectionResult(null)}
                      className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 uppercase tracking-wider"
                    >
                      CLEAR & EDIT
                    </button>
                  </div>
                  <div className="flex-grow p-6 overflow-y-auto bg-transparent text-sm font-sans text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {detectionResult.fragments && detectionResult.fragments.length > 0 ? (
                      detectionResult.fragments.map((frag, idx) => (
                        <span key={idx} className={frag.isAI ? "bg-yellow-200 rounded px-0.5" : "bg-green-200 rounded px-0.5"}>{frag.text}</span>
                      ))
                    ) : (
                      <textarea
                        className="w-full h-full border-0 focus-visible:ring-0 focus:outline-none resize-none text-sm font-sans text-slate-600 leading-relaxed bg-transparent"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                      />
                    )}
                  </div>
                </div>
             ) : (
                <DiffViewer original={inputText} modified={humanizeResult.humanizedText} />
             )}
            
            {/* Action Bar */}
            <div className="h-24 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between shrink-0">
              <div className="flex gap-6 items-center">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Input Length</span>
                  <span className="text-lg font-bold text-slate-700">{inputText.split(/\s+/).filter(Boolean).length} wds</span>
                </div>
                <div className="w-[1px] h-8 bg-slate-200"></div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Humanized</span>
                  <span className="text-lg font-bold text-indigo-600">
                    {humanizeResult ? "YES" : "NO"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleHumanize()}
                  disabled={isHumanizing || !inputText.trim()}
                  className="flex items-center justify-center px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 shadow-md shadow-indigo-200 transition-all h-auto disabled:opacity-50"
                >
                  {isHumanizing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isHumanizing ? "PROCESSING..." : "HUMANIZE TEXT"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* RIGHT PANEL: CONTROLS */}
      <section className="w-full lg:w-[220px] flex flex-col gap-6 shrink-0">
        
        {/* Output Tone */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Output Tone</h3>
          <div className="space-y-2">
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

        {/* Refinement */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex-grow flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Refinement</h3>
          
          <div className="space-y-6 flex-grow flex flex-col">
            {humanizeResult ? (
              <>
                 <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-3">Refinement Note</label>
                    <textarea 
                      placeholder="e.g. Make it shorter, use simpler words..."
                      className="w-full min-h-[100px] p-3 text-xs resize-none rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={refinementContext}
                      onChange={(e) => setRefinementContext(e.target.value)}
                    />
                 </div>
                 <div className="pt-2 mt-auto">
                    <button 
                      onClick={() => handleHumanize(true)} 
                      disabled={isHumanizing || !refinementContext.trim()}
                      className="flex items-center justify-center w-full py-4 border-slate-200 rounded-xl text-indigo-600 text-xs font-bold shrink-0 bg-indigo-50/50 hover:bg-indigo-100/50 hover:text-indigo-700 h-auto border disabled:opacity-50"
                    >
                      {isHumanizing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                      RE-APPLY TONE
                    </button>
                 </div>
              </>
            ) : (
               <div className="flex-grow flex flex-col items-center justify-center text-center text-slate-400">
                  <Languages className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-xs px-2 leading-relaxed">
                    Humanize your text first to unlock refinement controls.
                  </p>
               </div>
            )}
           
          </div>
        </div>
      </section>

    </div>
  );
}
