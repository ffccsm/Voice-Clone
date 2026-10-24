import React from "react";
import { Mic, Radio, Sparkles, Layers, Sliders, Volume2, AudioWaveform } from "lucide-react";
import { VoiceCloneProfile } from "../types/voice";

interface HeaderProps {
  activeTab: "synth" | "clone" | "library" | "compare";
  setActiveTab: (tab: "synth" | "clone" | "library" | "compare") => void;
  selectedVoice: VoiceCloneProfile;
  customCloneCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedVoice,
  customCloneCount,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 shadow-lg shadow-cyan-500/20">
              <AudioWaveform className="w-5 h-5 text-white animate-pulse" />
              <div className="absolute -inset-1 rounded-xl bg-cyan-500/20 blur-sm -z-10" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent">
                  VoxClone AI
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 uppercase tracking-wider">
                  Neural Studio
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Gemini 3.8 Acoustic Voice Cloning & Synthesis
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("synth")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "synth"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Studio Synthesizer</span>
            </button>

            <button
              onClick={() => setActiveTab("clone")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "clone"
                  ? "bg-gradient-to-r from-cyan-500 to-indigo-500 text-white shadow-md shadow-indigo-500/25 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Mic className="w-4 h-4 text-cyan-400" />
              <span>Clone Voice</span>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
            </button>

            <button
              onClick={() => setActiveTab("library")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "library"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Voice Library</span>
              {customCloneCount > 0 && (
                <span className="bg-slate-800 text-cyan-300 text-[10px] px-1.5 py-0.2 rounded-full border border-cyan-800/40">
                  {customCloneCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("compare")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === "compare"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Radio className="w-4 h-4" />
              <span className="hidden md:inline">Acoustic Comparison</span>
              <span className="md:hidden">Compare</span>
            </button>
          </nav>

          {/* Active Voice Pill */}
          <div className="hidden lg:flex items-center space-x-2 pl-3 border-l border-slate-800 text-xs">
            <span className="text-slate-400">Active Profile:</span>
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
              <span
                className={`w-2.5 h-2.5 rounded-full bg-gradient-to-tr ${
                  selectedVoice.avatarColor || "from-cyan-400 to-indigo-500"
                }`}
              />
              <span className="font-medium text-slate-200 max-w-[130px] truncate">
                {selectedVoice.name}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded">
                {selectedVoice.recommendedBaseVoice}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
