"use client";

import { useState, useEffect } from "react";
import { MainPanel } from "@/components/main-panel";
import { Settings, X, Key, Eye, EyeOff, Bot } from "lucide-react";

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
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center text-white font-bold">L</div>
          <h1 className="text-lg font-semibold tracking-tight">LOOM AI <span className="text-slate-400 font-normal">| TEXT ANALYTICS</span></h1>
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
      <main className="flex-grow flex p-6 gap-6 overflow-hidden">
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
                <select
                  value={tempModel}
                  onChange={(e) => setTempModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="gemini">Gemini</option>
                  <option value="claude">Claude</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">Deepseek</option>
                  <option value="minimax">Minimax</option>
                  <option value="glm">GLM</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Key className="w-3 h-3" />
                  Provider API Key
                </label>
                <div className="relative">
                  <input 
                    type={showApiKey ? "text" : "password"} 
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    placeholder="Enter API key..."
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
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  Required to connect to the selected AI model. Your key is stored securely in your browser's local storage.
                </p>
              </div>
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
