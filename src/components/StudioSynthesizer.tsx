import React, { useState, useRef, useEffect } from "react";
import {
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Download,
  Sparkles,
  Sliders,
  Wand2,
  ChevronDown,
  Layers,
  Clock,
  Radio,
  FileText,
  Copy,
  Check,
  Zap,
} from "lucide-react";
import { VoiceCloneProfile, SynthesizedAudio, ScriptSuggestion } from "../types/voice";
import { getAudioContext, drawVisualizer, base64ToBlobUrl } from "../utils/audioEngine";
import { apiPost } from "../utils/apiClient";

interface StudioSynthesizerProps {
  voices: VoiceCloneProfile[];
  selectedVoice: VoiceCloneProfile;
  onSelectVoice: (voice: VoiceCloneProfile) => void;
  onUpdateVoice?: (voice: VoiceCloneProfile) => void;
  onOpenComparison: (profile: VoiceCloneProfile, audio: SynthesizedAudio) => void;
}

export const StudioSynthesizer: React.FC<StudioSynthesizerProps> = ({
  voices,
  selectedVoice,
  onSelectVoice,
  onUpdateVoice,
  onOpenComparison,
}) => {
  // Synthesis Input
  const [inputText, setInputText] = useState<string>(
    "Welcome to VoxClone AI. This synthetic voice was generated from neural acoustic profiling, capturing our timbre, pacing, and cadence with lifelike expression."
  );
  const [stylePrompt, setStylePrompt] = useState<string>(selectedVoice.stylePrompt);
  const [activeBaseVoice, setActiveBaseVoice] = useState<VoiceCloneProfile["recommendedBaseVoice"]>(
    selectedVoice.recommendedBaseVoice || "Charon"
  );
  const [selectedModel, setSelectedModel] = useState<"gemini-3.8-flash-tts" | "gemini-3.8-flash-lite-tts">(
    "gemini-3.8-flash-tts"
  );
  const [playbackRate, setPlaybackRate] = useState<number>(
    selectedVoice.tuningRecommendations?.recommendedPlaybackRate || 1.0
  );
  const [bassBoost, setBassBoost] = useState<number>(
    selectedVoice.tuningRecommendations?.bassBoostDb || 1.5
  );
  const [showAdvancedTuning, setShowAdvancedTuning] = useState<boolean>(true);

  // Script suggestions state
  const [isGeneratingScripts, setIsGeneratingScripts] = useState<boolean>(false);
  const [scriptSuggestions, setScriptSuggestions] = useState<ScriptSuggestion[]>([]);
  const [showScriptModal, setShowScriptModal] = useState<boolean>(false);

  // Synthesis loading and results
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<SynthesizedAudio | null>(null);
  const [synthHistory, setSynthHistory] = useState<SynthesizedAudio[]>([]);

  // Audio Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // Audio & Canvas refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bassFilterNodeRef = useRef<BiquadFilterNode | null>(null);
  const cleanupVisualizerRef = useRef<(() => void) | null>(null);

  // Update style prompt and base voice when selected voice changes
  useEffect(() => {
    setStylePrompt(selectedVoice.stylePrompt);
    setActiveBaseVoice(selectedVoice.recommendedBaseVoice || "Charon");
    if (selectedVoice.tuningRecommendations) {
      setPlaybackRate(selectedVoice.tuningRecommendations.recommendedPlaybackRate || 1.0);
      setBassBoost(selectedVoice.tuningRecommendations.bassBoostDb || 1.0);
    }
  }, [selectedVoice.id, selectedVoice.recommendedBaseVoice]);

  const handleAnchorChange = (newAnchor: VoiceCloneProfile["recommendedBaseVoice"]) => {
    setActiveBaseVoice(newAnchor);
    const isMale = ["Charon", "Fenrir", "Puck"].includes(newAnchor);
    let updatedPrompt = stylePrompt;
    if (isMale && /female|feminine|soprano|contralto/i.test(updatedPrompt)) {
      updatedPrompt =
        "Natural masculine male voice with warm chest resonance, clear articulation, and balanced conversational cadence.";
      setStylePrompt(updatedPrompt);
    } else if (!isMale && /\bmale\b|masculine|baritone|bass/i.test(updatedPrompt)) {
      updatedPrompt =
        "Natural warm female voice with expressive clarity, smooth resonance, and balanced conversational cadence.";
      setStylePrompt(updatedPrompt);
    }
    if (onUpdateVoice && !selectedVoice.isPreset) {
      onUpdateVoice({
        ...selectedVoice,
        recommendedBaseVoice: newAnchor,
        genderClass: isMale
          ? newAnchor === "Fenrir"
            ? "Deep Male Bass-Baritone"
            : newAnchor === "Puck"
            ? "Male Tenor"
            : "Male Baritone"
          : newAnchor === "Zephyr"
          ? "Female Mezzo-Soprano"
          : "Female Contralto",
        stylePrompt: updatedPrompt,
      });
    }
  };

  // Audio element listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [currentAudio]);

  // Handle Playback with Web Audio EQ
  const togglePlayAudio = async () => {
    const audio = audioRef.current;
    if (!audio || !currentAudio) return;

    const audioCtx = getAudioContext();

    // Hook up Web Audio nodes once
    if (!audioSourceNodeRef.current) {
      try {
        const source = audioCtx.createMediaElementSource(audio);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        const bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 250;
        bassFilter.gain.value = bassBoost;

        source.connect(bassFilter);
        bassFilter.connect(analyser);
        analyser.connect(audioCtx.destination);

        audioSourceNodeRef.current = source;
        analyserRef.current = analyser;
        bassFilterNodeRef.current = bassFilter;
      } catch (e) {
        console.warn("MediaElementAudioSourceNode already created or Web Audio error", e);
      }
    }

    // Update bass filter gain if changed
    if (bassFilterNodeRef.current) {
      bassFilterNodeRef.current.gain.value = bassBoost;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      await audio.play();
      setIsPlaying(true);

      if (canvasRef.current && analyserRef.current) {
        if (cleanupVisualizerRef.current) cleanupVisualizerRef.current();
        cleanupVisualizerRef.current = drawVisualizer(
          canvasRef.current,
          analyserRef.current,
          "bars",
          "#06b6d4"
        );
      }
    }
  };

  // Perform Speech Synthesis via Server-side Gemini API
  const handleSynthesize = async () => {
    if (!inputText.trim()) return;

    setIsSynthesizing(true);
    setSynthesisError(null);

    try {
      const data = await apiPost<{ audioBase64: string }>("/api/clone/synthesize", {
        text: inputText,
        baseVoice: activeBaseVoice || selectedVoice.recommendedBaseVoice || "Charon",
        stylePrompt: stylePrompt || selectedVoice.stylePrompt,
        model: selectedModel,
      });

      const blobUrl = base64ToBlobUrl(data.audioBase64, "audio/wav");

      const newAudio: SynthesizedAudio = {
        id: "synth_" + Date.now(),
        profileId: selectedVoice.id,
        profileName: selectedVoice.name,
        text: inputText,
        audioBase64: data.audioBase64,
        audioUrl: blobUrl,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        stylePrompt: stylePrompt,
        baseVoice: activeBaseVoice,
        model: selectedModel,
      };

      setCurrentAudio(newAudio);
      setSynthHistory((prev) => [newAudio, ...prev.slice(0, 9)]);

      // Auto-load and play
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = blobUrl;
          audioRef.current.playbackRate = playbackRate;
          audioRef.current.play().then(() => {
            setIsPlaying(true);
            if (canvasRef.current && analyserRef.current) {
              if (cleanupVisualizerRef.current) cleanupVisualizerRef.current();
              cleanupVisualizerRef.current = drawVisualizer(
                canvasRef.current,
                analyserRef.current,
                "bars",
                "#06b6d4"
              );
            }
          }).catch((err) => {
            console.log("Auto-play blocked, ready for user play", err);
          });
        }
      }, 100);
    } catch (err: any) {
      console.error("Synthesizer error:", err);
      setSynthesisError(err.message || "Failed to synthesize speech");
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Insert expressivity tag into text prompt
  const insertTag = (tag: string) => {
    setInputText((prev) => prev + " " + tag + " ");
  };

  // Fetch script suggestions from Gemini
  const handleFetchScriptSuggestions = async () => {
    setIsGeneratingScripts(true);
    setShowScriptModal(true);
    try {
      const data = await apiPost<{ scripts: ScriptSuggestion[] }>("/api/clone/script-suggest", {
        profile: selectedVoice,
      });
      setScriptSuggestions(data.scripts || []);
    } catch (e) {
      console.error("Failed to generate scripts", e);
    } finally {
      setIsGeneratingScripts(false);
    }
  };

  // Word count & duration estimate
  const words = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.max(1, Math.round((words / (selectedVoice.speechRateWpm || 140)) * 60));

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Hidden audio element */}
      <audio ref={audioRef} crossOrigin="anonymous" className="hidden" />

      {/* Top Banner: Voice Selector & Model Indicator */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Selected Voice Card */}
        <div className="flex items-center space-x-4">
          <div
            className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${
              selectedVoice.avatarColor || "from-cyan-400 to-indigo-600"
            } flex items-center justify-center shadow-lg shadow-cyan-500/10 text-white font-extrabold text-xl shrink-0`}
          >
            {selectedVoice.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-extrabold text-white">{selectedVoice.name}</h2>
              {selectedVoice.isPreset ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                  Preset
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 font-semibold border border-cyan-800">
                  Custom Clone
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
              <span className="text-cyan-400 font-medium">{selectedVoice.genderClass}</span>
              <span>•</span>
              <span className="font-mono">{selectedVoice.pitchRangeHz}</span>
              <span>•</span>
              <span>Anchor: <strong className="text-slate-200">{selectedVoice.recommendedBaseVoice}</strong></span>
              <span>•</span>
              <span>~{selectedVoice.speechRateWpm} WPM</span>
            </div>
          </div>
        </div>

        {/* Voice switcher dropdown */}
        <div className="flex items-center space-x-3">
          <label className="text-xs text-slate-400 hidden sm:inline">Switch Voice:</label>
          <div className="relative">
            <select
              value={selectedVoice.id}
              onChange={(e) => {
                const found = voices.find((v) => v.id === e.target.value);
                if (found) onSelectVoice(found);
              }}
              className="bg-slate-950 border border-slate-800 hover:border-cyan-500 text-white text-xs font-semibold rounded-xl px-3.5 py-2.5 pr-8 appearance-none outline-none cursor-pointer transition-all"
            >
              <optgroup label="Custom Cloned Voices">
                {voices
                  .filter((v) => !v.isPreset)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.recommendedBaseVoice})
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Curated Presets">
                {voices
                  .filter((v) => v.isPreset)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </optgroup>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Script Editor & Expression Toolbar (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Speech Script</h3>
              </div>
              <button
                onClick={handleFetchScriptSuggestions}
                disabled={isGeneratingScripts}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-semibold transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>AI Script Suggestions</span>
              </button>
            </div>

            {/* Vocal burst tags toolbar */}
            <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center justify-between">
                <span>Expressive Vocal Bursts & Backchanneling (Flagship 3.8):</span>
                <span className="text-cyan-400 lowercase">click to inject</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: "<breath>", label: "Intake Breath" },
                  { tag: "<laugh>", label: "Chuckle" },
                  { tag: "<gasp>", label: "Gasp" },
                  { tag: "|yeah|", label: "Casual 'yeah'" },
                  { tag: "|mhm|", label: "Agreement 'mhm'" },
                  { tag: "[pause: 500ms]", label: "Half-sec Pause" },
                ].map(({ tag, label }) => (
                  <button
                    key={tag}
                    onClick={() => insertTag(tag)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-700 transition-all font-mono cursor-pointer"
                  >
                    {tag} <span className="text-[10px] text-slate-500 font-sans">({label})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Textarea */}
            <div className="relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={6}
                placeholder="Type or paste the speech you want this cloned voice to say..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all leading-relaxed resize-none"
              />
              <div className="flex items-center justify-between text-xs text-slate-500 mt-2 px-1">
                <div className="flex items-center space-x-3">
                  <span>{words} words</span>
                  <span>•</span>
                  <span>{inputText.length} chars</span>
                  <span>•</span>
                  <span className="flex items-center space-x-1 text-cyan-400 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>~{estimatedSeconds}s duration</span>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setInputText("");
                  }}
                  className="hover:text-slate-300 cursor-pointer text-[11px]"
                >
                  Clear text
                </button>
              </div>
            </div>

            {/* Quick Demo Sentence Prompts */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-semibold">Quick Demo Phrases:</div>
              <div className="flex flex-wrap gap-2">
                {[
                  "Welcome back! Today we are testing high-fidelity acoustic voice cloning.",
                  "Beyond the quiet horizon, every sound frequency carries a story waiting to be heard.",
                  "Attention team: <breath> The breakthrough neural synthesis model is officially live.",
                  "Could this really be synthesized? |yeah| the nuance and warmth are unbelievable.",
                ].map((phrase, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInputText(phrase)}
                    className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-left truncate max-w-full transition-all cursor-pointer"
                  >
                    "{phrase.slice(0, 52)}..."
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Synthesize CTA */}
            <button
              onClick={handleSynthesize}
              disabled={isSynthesizing || !inputText.trim()}
              className="w-full flex items-center justify-center space-x-2 py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-600 hover:opacity-95 text-slate-950 font-extrabold text-sm shadow-xl shadow-cyan-500/25 transition-all disabled:opacity-50 cursor-pointer transform active:scale-98"
            >
              {isSynthesizing ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Synthesizing Expressive Speech with VoxClone...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>Synthesize Voice Clone</span>
                </>
              )}
            </button>

            {synthesisError && (
              <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300">
                {synthesisError}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Audio Output Player & Acoustic Tuning (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Output Player Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Synthesized Audio Output</h3>
              </div>
              {currentAudio && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                  24kHz WAV Master
                </span>
              )}
            </div>

            {currentAudio ? (
              <div className="space-y-4">
                {/* Real-time Waveform Canvas */}
                <div className="relative bg-slate-950 rounded-xl border border-slate-800 h-24 flex items-center justify-center overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                  {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 bg-slate-950/40">
                      Press play to stream audio visualizer
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.01}
                    value={currentTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCurrentTime(val);
                      if (audioRef.current) audioRef.current.currentTime = val;
                    }}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Player Controls */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={togglePlayAudio}
                      className="w-12 h-12 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/30 transition-all cursor-pointer"
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-slate-950" />
                      ) : (
                        <Play className="w-5 h-5 fill-slate-950 translate-x-0.5" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = 0;
                          setCurrentTime(0);
                        }
                      }}
                      className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                      title="Replay from start"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Speed toggle */}
                  <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                    {[0.9, 1.0, 1.25, 1.5].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => {
                          setPlaybackRate(rate);
                          if (audioRef.current) audioRef.current.playbackRate = rate;
                        }}
                        className={`px-2 py-1 rounded font-mono ${
                          playbackRate === rate
                            ? "bg-cyan-500 text-slate-950 font-bold"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Download WAV button */}
                  <a
                    href={currentAudio.audioUrl}
                    download={`VoxClone_${selectedVoice.name.replace(/\s+/g, "_")}_${Date.now()}.wav`}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 flex items-center space-x-1.5 text-xs font-semibold transition-all cursor-pointer"
                    title="Download pristine 24kHz WAV"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">WAV</span>
                  </a>
                </div>

                {/* Compare CTA */}
                {selectedVoice.originalAudioUrl && (
                  <button
                    onClick={() => onOpenComparison(selectedVoice, currentAudio)}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 px-3 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Radio className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Compare with Original Reference Sample</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="py-10 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700 mx-auto flex items-center justify-center text-slate-500">
                  <Volume2 className="w-6 h-6 text-slate-500" />
                </div>
                <div className="text-sm font-semibold text-slate-300">No Audio Generated Yet</div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Click "Synthesize Voice Clone" on the left to produce high-resolution speech.
                </p>
              </div>
            )}
          </div>

          {/* Acoustic Tuning & Engine Config */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Acoustic Model Tuning</h3>
              </div>
              <button
                onClick={() => setShowAdvancedTuning(!showAdvancedTuning)}
                className="text-xs text-cyan-400 hover:underline cursor-pointer"
              >
                {showAdvancedTuning ? "Hide" : "Show"}
              </button>
            </div>

            {/* Model choice */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-semibold">Gemini Speech Model:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSelectedModel("gemini-3.8-flash-tts")}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                    selectedModel === "gemini-3.8-flash-tts"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-200"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="font-bold text-white">Flash TTS (3.8)</div>
                  <div className="text-[10px] text-slate-400">Flagship Voice Design</div>
                </button>
                <button
                  onClick={() => setSelectedModel("gemini-3.8-flash-lite-tts")}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                    selectedModel === "gemini-3.8-flash-lite-tts"
                      ? "bg-cyan-950/60 border-cyan-500 text-cyan-200"
                      : "bg-slate-950 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="font-bold text-white">Flash-Lite TTS</div>
                  <div className="text-[10px] text-slate-400">Ultra-fast latency</div>
                </button>
              </div>
            </div>

            {/* Cloned Style Directive Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="text-slate-300 font-semibold">
                  Acoustic Style Directive (speechMetadata.style):
                </label>
                <button
                  onClick={() => setStylePrompt(selectedVoice.stylePrompt)}
                  className="text-[10px] text-slate-500 hover:text-cyan-400 cursor-pointer"
                >
                  Reset
                </button>
              </div>
              <textarea
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl p-3 text-xs text-slate-200 font-mono outline-none resize-none"
              />
            </div>

            {/* Voice Gender & Neural Base Voice Selector */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <label className="text-slate-300 font-semibold">
                  Voice Gender & Neural Anchor:
                </label>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    ["Charon", "Fenrir", "Puck"].includes(activeBaseVoice)
                      ? "bg-cyan-950/80 text-cyan-300 border-cyan-800"
                      : "bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-800"
                  }`}
                >
                  {["Charon", "Fenrir", "Puck"].includes(activeBaseVoice)
                    ? `Male (${activeBaseVoice})`
                    : `Female (${activeBaseVoice})`}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Male Voice Anchors
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "Charon", label: "Charon", desc: "Deep Male" },
                      { id: "Fenrir", label: "Fenrir", desc: "Rugged Male" },
                      { id: "Puck", label: "Puck", desc: "Tenor Male" },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleAnchorChange(v.id)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        activeBaseVoice === v.id
                          ? "bg-cyan-950/80 border-cyan-400 text-white shadow-sm shadow-cyan-500/20"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{v.label}</div>
                      <div className="text-[10px] text-cyan-400">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Female Voice Anchors
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: "Kore", label: "Kore", desc: "Warm Female" },
                      { id: "Zephyr", label: "Zephyr", desc: "Crisp Female" },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleAnchorChange(v.id)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        activeBaseVoice === v.id
                          ? "bg-fuchsia-950/80 border-fuchsia-400 text-white shadow-sm shadow-fuchsia-500/20"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="text-xs font-bold text-white">{v.label}</div>
                      <div className="text-[10px] text-fuchsia-400">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Advanced EQ & Playback Sliders */}
            {showAdvancedTuning && (
              <div className="space-y-4 pt-2 border-t border-slate-800 animate-in fade-in">
                {/* Bass Boost EQ */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Chest Resonance / Bass Boost (Web Audio LowShelf):</span>
                    <span className="font-mono text-cyan-400">{bassBoost} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-4}
                    max={6}
                    step={0.5}
                    value={bassBoost}
                    onChange={(e) => setBassBoost(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Script Suggestions Modal */}
      {showScriptModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Demonstration Scripts for {selectedVoice.name}
                </h3>
              </div>
              <button
                onClick={() => setShowScriptModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {isGeneratingScripts ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-400">
                  Gemini is drafting personalized scripts tailored to this voice persona...
                </p>
              </div>
            ) : scriptSuggestions.length > 0 ? (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {scriptSuggestions.map((s, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-xl space-y-2 transition-all"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-indigo-300">{s.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {s.category} • ~{s.estimatedDurationSec}s
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-serif italic">
                      "{s.text}"
                    </p>
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => {
                          setInputText(s.text);
                          setShowScriptModal(false);
                        }}
                        className="text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                      >
                        Use Script
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No scripts loaded. Try again.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
