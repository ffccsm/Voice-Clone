import React, { useState } from "react";
import {
  Layers,
  Search,
  Volume2,
  Trash2,
  Copy,
  Download,
  Info,
  Play,
  Pause,
  Plus,
  Sliders,
  Sparkles,
  Check,
} from "lucide-react";
import { VoiceCloneProfile } from "../types/voice";

interface VoiceLibraryProps {
  voices: VoiceCloneProfile[];
  selectedVoice: VoiceCloneProfile;
  onSelectVoice: (voice: VoiceCloneProfile) => void;
  onNavigateToClone: () => void;
  onDeleteCustomVoice: (id: string) => void;
}

export const VoiceLibrary: React.FC<VoiceLibraryProps> = ({
  voices,
  selectedVoice,
  onSelectVoice,
  onNavigateToClone,
  onDeleteCustomVoice,
}) => {
  const [filterType, setFilterType] = useState<"all" | "custom" | "presets">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [inspectingVoice, setInspectingVoice] = useState<VoiceCloneProfile | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [copiedProfileId, setCopiedProfileId] = useState<string | null>(null);

  const filteredVoices = voices.filter((v) => {
    if (filterType === "custom" && v.isPreset) return false;
    if (filterType === "presets" && !v.isPreset) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.genderClass.toLowerCase().includes(q) ||
      v.recommendedBaseVoice.toLowerCase().includes(q) ||
      v.timbreTraits.some((t) => t.toLowerCase().includes(q)) ||
      v.accentProfile.toLowerCase().includes(q)
    );
  });

  const exportProfileAsJson = (profile: VoiceCloneProfile) => {
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profile, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonStr);
    downloadAnchor.setAttribute("download", `VoxClone_${profile.name.replace(/\s+/g, "_")}_profile.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const copyDirective = (profile: VoiceCloneProfile) => {
    navigator.clipboard.writeText(profile.stylePrompt);
    setCopiedProfileId(profile.id);
    setTimeout(() => setCopiedProfileId(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div>
          <h2 className="text-2xl font-extrabold text-white">Voice Clone Library</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage your personalized neural voice clones and browse curated acoustic presets.
          </p>
        </div>

        <button
          onClick={onNavigateToClone}
          className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer self-start md:self-auto"
        >
          <Plus className="w-4 h-4 text-slate-950" />
          <span>Clone New Voice</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex items-center space-x-1 bg-slate-900 p-1.5 rounded-xl border border-slate-800 w-full sm:w-auto">
          <button
            onClick={() => setFilterType("all")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === "all"
                ? "bg-cyan-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All Voices ({voices.length})
          </button>
          <button
            onClick={() => setFilterType("custom")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === "custom"
                ? "bg-cyan-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Custom Clones ({voices.filter((v) => !v.isPreset).length})
          </button>
          <button
            onClick={() => setFilterType("presets")}
            className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === "presets"
                ? "bg-cyan-500 text-slate-950 shadow-md"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Curated Presets ({voices.filter((v) => v.isPreset).length})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, timbre, accent..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Voice Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVoices.map((voice) => {
          const isSelected = selectedVoice.id === voice.id;

          return (
            <div
              key={voice.id}
              className={`bg-slate-900/90 rounded-2xl border transition-all p-5 flex flex-col justify-between space-y-4 shadow-xl group hover:shadow-cyan-500/10 ${
                isSelected
                  ? "border-cyan-500 ring-1 ring-cyan-500/50 bg-slate-900"
                  : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="space-y-4">
                {/* Card Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${
                        voice.avatarColor || "from-cyan-400 to-indigo-600"
                      } flex items-center justify-center text-white font-extrabold text-lg shadow-md shrink-0`}
                    >
                      {voice.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm text-white group-hover:text-cyan-400 transition-colors">
                        {voice.name}
                      </h3>
                      <p className="text-xs text-slate-400">{voice.genderClass}</p>
                    </div>
                  </div>

                  {voice.isPreset ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-semibold border border-slate-700">
                      Preset
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800">
                      Cloned
                    </span>
                  )}
                </div>

                {/* Acoustic Badges */}
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Anchor Voice:</span>
                    <span className="font-bold text-indigo-400">{voice.recommendedBaseVoice}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Pitch (F0):</span>
                    <span className="font-mono text-slate-300">{voice.pitchRangeHz}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Speed:</span>
                    <span className="text-slate-300 font-mono">~{voice.speechRateWpm} WPM</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Clarity:</span>
                    <span className="text-emerald-400 font-bold">{voice.sampleClarityScore}%</span>
                  </div>
                </div>

                {/* Timbre tags */}
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    Timbre Formants:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {voice.timbreTraits.slice(0, 3).map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60"
                      >
                        {t}
                      </span>
                    ))}
                    {voice.timbreTraits.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded text-slate-500">
                        +{voice.timbreTraits.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                {/* Accent Snippet */}
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  <strong className="text-slate-300">Accent:</strong> {voice.accentProfile}
                </p>
              </div>

              {/* Bottom Actions */}
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onSelectVoice(voice)}
                    className={`flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{isSelected ? "Active in Studio" : "Use in Studio"}</span>
                  </button>

                  <button
                    onClick={() => setInspectingVoice(voice)}
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 cursor-pointer"
                    title="View acoustic profile details"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => exportProfileAsJson(voice)}
                    className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 cursor-pointer"
                    title="Export JSON profile"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  {!voice.isPreset && (
                    <button
                      onClick={() => onDeleteCustomVoice(voice.id)}
                      className="p-2 rounded-xl bg-slate-800/60 hover:bg-red-950 text-slate-400 hover:text-red-400 border border-slate-700/60 cursor-pointer"
                      title="Delete custom clone"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredVoices.length === 0 && (
        <div className="py-16 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800">
          <Layers className="w-8 h-8 text-slate-600 mx-auto" />
          <h4 className="text-sm font-semibold text-slate-300">No voices match your search</h4>
          <p className="text-xs text-slate-500">Try adjusting your filters or record a new voice.</p>
        </div>
      )}

      {/* Inspect Voice Modal */}
      {inspectingVoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${
                    inspectingVoice.avatarColor || "from-cyan-400 to-indigo-600"
                  } flex items-center justify-center text-white font-bold`}
                >
                  {inspectingVoice.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{inspectingVoice.name}</h3>
                  <p className="text-xs text-cyan-400">{inspectingVoice.genderClass}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectingVoice(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1 text-xs">
              {/* Directive */}
              <div className="space-y-1 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[10px]">
                  <span>TTS Style Prompt Directive</span>
                  <button
                    onClick={() => copyDirective(inspectingVoice)}
                    className="text-cyan-400 flex items-center space-x-1 lowercase hover:underline cursor-pointer"
                  >
                    {copiedProfileId === inspectingVoice.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-slate-200 font-mono text-[11px] leading-relaxed italic">
                  "{inspectingVoice.stylePrompt}"
                </p>
              </div>

              {/* Cadence & Emotional details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-slate-400 font-semibold">Cadence & Rhythm</span>
                  <p className="text-slate-200 leading-relaxed text-[11px]">
                    {inspectingVoice.cadenceDescription}
                  </p>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-slate-400 font-semibold">Emotional Tone</span>
                  <p className="text-slate-200 leading-relaxed text-[11px]">
                    {inspectingVoice.emotionalBaseline}
                  </p>
                </div>
              </div>

              {/* Formants */}
              <div className="space-y-1.5">
                <span className="text-slate-400 font-semibold">Formants & Timbre Characteristics:</span>
                <div className="flex flex-wrap gap-1.5">
                  {inspectingVoice.timbreTraits.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 text-[11px]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-3">
              <button
                onClick={() => {
                  onSelectVoice(inspectingVoice);
                  setInspectingVoice(null);
                }}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Activate in Synthesizer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
