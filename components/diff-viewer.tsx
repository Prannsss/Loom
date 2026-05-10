"use client";

import { useMemo, useState } from "react";
import * as Diff from "diff";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  original: string;
  modified: string;
}

export function DiffViewer({ original, modified }: DiffViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(modified);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const diffResult = useMemo(() => {
    return Diff.diffWordsWithSpace(original, modified);
  }, [original, modified]);

  const wordCountOriginal = original.split(/\s+/).filter(Boolean).length;
  const wordCountModified = modified.split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm shadow-indigo-100/20">
      
      {/* Left side: Original */}
      <div className="bg-white flex flex-col p-6 max-h-[500px] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white/90 pb-2 z-10">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original Input</span>
          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded">{wordCountOriginal} Words</span>
        </div>
        <div className="text-sm text-slate-600 leading-relaxed font-sans whitespace-pre-wrap">
          {diffResult.map((part, index) => {
            if (part.added) return null;
            if (part.removed) {
              return (
                <span key={`orig-${index}`} className="bg-orange-50 border-l-2 border-orange-400 pl-1 pr-1 font-medium text-orange-800">
                  {part.value}
                </span>
              );
            }
            return <span key={`orig-${index}`} className="text-slate-600">{part.value}</span>;
          })}
        </div>
      </div>

      {/* Right side: Humanized */}
      <div className="bg-white flex flex-col p-6 max-h-[500px] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white/90 pb-2 z-10">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Humanized Version</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">{wordCountModified} Words</span>
            <button
              onClick={handleCopy}
              title="Copy humanized text"
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded transition-colors
                bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"
            >
              {copied
                ? <><Check className="w-3 h-3" /> Copied!</>
                : <><Copy className="w-3 h-3" /> Copy</>
              }
            </button>
          </div>
        </div>
        <div className="text-sm text-slate-800 font-medium leading-relaxed font-sans whitespace-pre-wrap">
          {diffResult.map((part, index) => {
            if (part.removed) return null;
            if (part.added) {
              return (
                <span key={`mod-${index}`} className="bg-indigo-50 border-l-2 border-indigo-400 pl-1 pr-1 font-bold text-indigo-900">
                  {part.value}
                </span>
              );
            }
            return <span key={`mod-${index}`} className="text-slate-700">{part.value}</span>;
          })}
        </div>
      </div>

    </div>
  );
}
