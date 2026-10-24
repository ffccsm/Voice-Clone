import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { StudioSynthesizer } from "./components/StudioSynthesizer";
import { VoiceCloner } from "./components/VoiceCloner";
import { VoiceLibrary } from "./components/VoiceLibrary";
import { AcousticComparison } from "./components/AcousticComparison";
import { PRESET_VOICES } from "./data/presetVoices";
import { VoiceCloneProfile, SynthesizedAudio } from "./types/voice";
import { AudioWaveform, Sparkles, Shield, Cpu } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"synth" | "clone" | "library" | "compare">("synth");
  const [voices, setVoices] = useState<VoiceCloneProfile[]>(() => {
    try {
      const saved = localStorage.getItem("voxclone_custom_profiles");
      if (saved) {
        const parsed = JSON.parse(saved);
        return [...parsed, ...PRESET_VOICES];
      }
    } catch (e) {
      console.warn("Could not read saved custom profiles", e);
    }
    return PRESET_VOICES;
  });

  const [selectedVoice, setSelectedVoice] = useState<VoiceCloneProfile>(PRESET_VOICES[0]);
  const [latestAudio, setLatestAudio] = useState<SynthesizedAudio | null>(null);

  // Sync custom profiles to localStorage
  const saveCustomProfiles = (updatedVoices: VoiceCloneProfile[]) => {
    const customOnly = updatedVoices.filter((v) => !v.isPreset);
    try {
      localStorage.setItem("voxclone_custom_profiles", JSON.stringify(customOnly));
    } catch (e) {
      console.warn("Could not persist to localStorage", e);
    }
  };

  const handleCloneComplete = (newProfile: VoiceCloneProfile) => {
    setVoices((prev) => {
      const updated = [newProfile, ...prev];
      saveCustomProfiles(updated);
      return updated;
    });
    setSelectedVoice(newProfile);
  };

  const handleDeleteCustomVoice = (id: string) => {
    setVoices((prev) => {
      const updated = prev.filter((v) => v.id !== id);
      saveCustomProfiles(updated);
      return updated;
    });
    if (selectedVoice.id === id) {
      setSelectedVoice(PRESET_VOICES[0]);
    }
  };

  const handleOpenInSynthesizer = (profile: VoiceCloneProfile) => {
    setSelectedVoice(profile);
    setActiveTab("synth");
  };

  const handleOpenComparison = (profile: VoiceCloneProfile, audio: SynthesizedAudio) => {
    setSelectedVoice(profile);
    setLatestAudio(audio);
    setActiveTab("compare");
  };

  const customCloneCount = voices.filter((v) => !v.isPreset).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedVoice={selectedVoice}
        customCloneCount={customCloneCount}
      />

      {/* Main Studio Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "synth" && (
          <StudioSynthesizer
            voices={voices}
            selectedVoice={selectedVoice}
            onSelectVoice={setSelectedVoice}
            onOpenComparison={handleOpenComparison}
          />
        )}

        {activeTab === "clone" && (
          <VoiceCloner
            onCloneComplete={handleCloneComplete}
            onOpenInSynthesizer={handleOpenInSynthesizer}
          />
        )}

        {activeTab === "library" && (
          <VoiceLibrary
            voices={voices}
            selectedVoice={selectedVoice}
            onSelectVoice={(v) => {
              setSelectedVoice(v);
              setActiveTab("synth");
            }}
            onNavigateToClone={() => setActiveTab("clone")}
            onDeleteCustomVoice={handleDeleteCustomVoice}
          />
        )}

        {activeTab === "compare" && (
          <AcousticComparison
            voices={voices}
            selectedVoice={selectedVoice}
            latestAudio={latestAudio}
            onNavigateToRecord={() => setActiveTab("clone")}
          />
        )}
      </main>

      {/* Studio Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <AudioWaveform className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-300">VoxClone AI Studio</span>
            <span>•</span>
            <span>24kHz 16-bit Master Audio</span>
          </div>

          <div className="flex items-center space-x-6 text-[11px]">
            <span className="flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Gemini 3.8 Flash TTS & Acoustic Profiler</span>
            </span>
            <span className="flex items-center space-x-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Client-side Audio Sandbox</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
