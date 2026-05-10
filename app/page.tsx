"use client";

import { useState, useEffect } from "react";
import { MainPanel } from "@/components/main-panel";
import { Settings, X, Key, Eye, EyeOff, Bot, ExternalLink } from "lucide-react";

type ModelOption = {
  value: string;
  label: string;
  model: string;
  tier: "free" | "paid";
  keyUrl: string;
  hint: string;
};

const MODEL_OPTIONS: ModelOption[] = [
  {
    value: "gemini",
    label: "Google Gemini",
    model: "gemini-2.5-flash",
    tier: "free",
    keyUrl: "https://aistudio.google.com/apikey",
    hint: "Get a free API key from Google AI Studio.",
  },
  {
    value: "claude",
    label: "Anthropic Claude",
    model: "claude-sonnet-4-6",
    tier: "paid",
    keyUrl: "https://console.anthropic.com/settings/keys",
    hint: "Requires a paid Anthropic account.",
  },
  {
    value: "openai",
    label: "OpenAI",
    model: "gpt-4.1",
    tier: "paid",
    keyUrl: "https://platform.openai.com/api-keys",
    hint: "Requires an OpenAI account with billing enabled.",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    model: "deepseek-v4-flash",
    tier: "paid",
    keyUrl: "https://platform.deepseek.com/api_keys",
    hint: "Very low-cost paid API. Get a key from DeepSeek Platform.",
  },
  {
    value: "minimax",
    label: "MiniMax",
    model: "MiniMax-M2.5",
    tier: "paid",
    keyUrl: "https://www.minimax.io/platform",
    hint: "Get an API key from MiniMax Platform.",
  },
  {
    value: "glm",
    label: "Zhipu AI (GLM)",
    model: "glm-5",
    tier: "paid",
    keyUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys",
    hint: "Get an API key from Zhipu AI Open Platform.",
  },
];

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [tempModel, setTempModel] = useState("gemini");
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem("custom_ai_api_key");
    const savedModel = localStorage.getItem("custom_ai_model");
    if (savedKey) {
      setApiKey(savedKey);
      setTempKey(savedKey);
    }
    if (savedModel) {
      setSelectedModel(savedModel);
      setTempModel(savedModel);
    }
  }, []);

  const handleSaveKey = () => {
    setApiKey(tempKey);
    setSelectedModel(tempModel);
    localStorage.setItem("custom_ai_api_key", tempKey);
    localStorage.setItem("custom_ai_model", tempModel);
    setIsSidebarOpen(false);
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden relative">
      {/* Header Navigation */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/favicon.ico" alt="Loom Logo" className="w-8 h-8 rounded" />
          <h1 className="text-lg font-semibold tracking-tight">LOOM AI <span className="text-slate-400 font-normal">| TEXT ANALYSIS</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            PDF / DOCX SUPPORTED
          </div>
          <button 
            onClick={() => {
              console.log("Opening sidebar");
              setIsSidebarOpen(true);
            }}
            className="p-2 rounded-full border border-slate-200 hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 relative z-[100] cursor-pointer"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="h-[calc(100vh-4rem)] flex p-5 gap-5 overflow-hidden">
        <MainPanel apiKey={apiKey} modelType={selectedModel} />
      </main>

      {/* Settings Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer" onClick={() => setIsSidebarOpen(false)}></div>
          <div className="w-[320px] bg-white h-full shadow-2xl relative flex flex-col">
            <div className="h-16 border-b flex items-center justify-between px-6 shrink-0">
              <h2 className="font-semibold flex items-center gap-2 text-slate-800">
                <Settings className="w-4 h-4 text-slate-500" /> Settings
              </h2>
              <button 
                onClick={() => setIsSidebarOpen(false)} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex-grow flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Bot className="w-3 h-3" />
                  AI Model Provider
                </label>
                <div className="flex flex-col gap-2">
                  {MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTempModel(opt.value)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                        tempModel === opt.value
                          ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${
                          tempModel === opt.value ? "text-indigo-700" : "text-slate-700"
                        }`}>{opt.label}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          opt.tier === "free"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {opt.tier === "free" ? "FREE" : "PAID"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{opt.model}</span>
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const selectedOpt = MODEL_OPTIONS.find((o) => o.value === tempModel);
                return (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Key className="w-3 h-3" />
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={tempKey}
                        onChange={(e) => setTempKey(e.target.value)}
                        placeholder={`Enter ${selectedOpt?.label ?? ""} API key...`}
                        className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {selectedOpt && (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-col gap-1.5">
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {selectedOpt.hint}
                        </p>
                        <a
                          href={selectedOpt.keyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          Get API Key <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Your key is stored locally in your browser only.
                    </p>
                  </div>
                );
              })()}
            </div>
            <div className="p-6 border-t shrink-0">
              <button 
                onClick={handleSaveKey}
                className="w-full py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
