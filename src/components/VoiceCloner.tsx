import React, { useState, useRef, useEffect } from "react";
import {
  Mic,
  Square,
  Play,
  Pause,
  Upload,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  Sliders,
  Volume2,
  ChevronRight,
  Info,
} from "lucide-react";
import { VoiceCloneProfile } from "../types/voice";
import { CALIBRATION_SCRIPTS } from "../data/presetVoices";
import {
  getAudioContext,
  drawVisualizer,
  calculateDecibels,
  fileToBase64,
} from "../utils/audioEngine";

interface VoiceClonerProps {
  onCloneComplete: (profile: VoiceCloneProfile) => void;
  onOpenInSynthesizer: (profile: VoiceCloneProfile) => void;
}

export const VoiceCloner: React.FC<VoiceClonerProps> = ({
  onCloneComplete,
  onOpenInSynthesizer,
}) => {
  const [sourceType, setSourceType] = useState<"record" | "upload">("record");
  const [selectedScriptId, setSelectedScriptId] = useState<string>("phonetic");
  const [customPromptText, setCustomPromptText] = useState<string>("");

  // Recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>("audio/webm");
  const [dbLevel, setDbLevel] = useState<number>(-60);
  const [isClipping, setIsClipping] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Upload state
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Playback preview state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Analysis / Cloning state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [clonedProfile, setClonedProfile] = useState<VoiceCloneProfile | null>(null);
  const [customCloneName, setCustomCloneName] = useState<string>("");

  // MediaRecorder & AudioContext refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const meterIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveAnalyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cleanupVisualizerRef = useRef<(() => void) | null>(null);

  // Active calibration text
  const currentScript =
    CALIBRATION_SCRIPTS.find((s) => s.id === selectedScriptId)?.text ||
    customPromptText;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecordingCleanup();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
    };
  }, []);

  const stopRecordingCleanup = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (meterIntervalRef.current) clearInterval(meterIntervalRef.current);
    if (cleanupVisualizerRef.current) cleanupVisualizerRef.current();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start recording
  const startRecording = async () => {
    setMicError(null);
    setRecordedAudioUrl(null);
    setAudioBase64(null);
    setRecordingSeconds(0);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const audioCtx = getAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      liveAnalyserRef.current = analyser;

      // Start canvas visualizer
      if (canvasRef.current) {
        cleanupVisualizerRef.current = drawVisualizer(
          canvasRef.current,
          analyser,
          "wave",
          "#06b6d4"
        );
      }

      // Start decibel level meter
      meterIntervalRef.current = window.setInterval(() => {
        if (liveAnalyserRef.current) {
          const { db, isClipping: clip } = calculateDecibels(liveAnalyserRef.current);
          setDbLevel(db);
          setIsClipping(clip);
        }
      }, 80);

      // MediaRecorder configuration
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      setAudioMimeType(mimeType);

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(url);

        const b64 = await fileToBase64(audioBlob);
        setAudioBase64(b64);
        setIsRecording(false);
        stopRecordingCleanup();
      };

      recorder.start(100);
      setIsRecording(true);

      // Duration counter
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone error:", err);
      setMicError(
        err.name === "NotAllowedError"
          ? "Microphone access was denied. Please allow microphone permissions in your browser."
          : "Could not access microphone: " + (err.message || "Unknown error")
      );
      setIsRecording(false);
      stopRecordingCleanup();
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setAudioMimeType(file.type || "audio/wav");
    const url = URL.createObjectURL(file);
    setRecordedAudioUrl(url);

    try {
      const b64 = await fileToBase64(file);
      setAudioBase64(b64);
      setAnalysisError(null);
    } catch (err) {
      setAnalysisError("Failed to read audio file");
    }
  };

  // Trigger Neural Voice Cloning Analysis
  const runVoiceCloningAnalysis = async () => {
    if (!audioBase64) return;

    setIsAnalyzing(true);
    setAnalysisError(null);
    setClonedProfile(null);

    try {
      setAnalysisStep("Decomposing harmonic frequencies and pitch baseline...");
      await new Promise((r) => setTimeout(r, 600));

      setAnalysisStep("Evaluating vocal tract resonance & cadence markers...");

      const sampleTitle =
        customCloneName.trim() ||
        (sourceType === "record" ? "My Cloned Voice" : uploadedFileName || "Imported Voice");

      const response = await fetch("/api/clone/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioData: audioBase64,
          mimeType: audioMimeType,
          sampleName: sampleTitle,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Neural acoustic analysis failed");
      }

      setAnalysisStep("Synthesizing neural style directive & anchor mapping...");
      const data = await response.json();

      if (data.profile) {
        const fullProfile: VoiceCloneProfile = {
          ...data.profile,
          name: customCloneName.trim() || data.profile.name || "My Cloned Voice",
          originalAudioUrl: recordedAudioUrl || undefined,
          avatarColor: getDynamicAvatarGradient(data.profile.recommendedBaseVoice),
        };
        setClonedProfile(fullProfile);
        setCustomCloneName(fullProfile.name);
        onCloneComplete(fullProfile);
      }
    } catch (err: any) {
      console.error("Cloning analysis error:", err);
      setAnalysisError(err.message || "Failed to analyze voice sample");
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep("");
    }
  };

  // Helper avatar colors
  const getDynamicAvatarGradient = (baseVoice: string) => {
    switch (baseVoice) {
      case "Charon":
        return "from-amber-600 via-orange-600 to-rose-700";
      case "Zephyr":
        return "from-cyan-400 via-sky-500 to-indigo-600";
      case "Puck":
        return "from-emerald-400 via-teal-500 to-cyan-600";
      case "Fenrir":
        return "from-red-600 via-stone-700 to-zinc-900";
      case "Kore":
      default:
        return "from-fuchsia-500 via-rose-500 to-amber-500";
    }
  };

  // Toggle playback of sample
  const togglePlayPreview = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      previewAudioRef.current.play();
      setIsPreviewPlaying(true);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Introduction banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800/60 text-cyan-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gemini 3.8 Acoustic Profiling Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Clone Any Voice in Seconds
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
              Record 10–20 seconds of your voice or upload a clear vocal sample.
              Our neural acoustic model extracts your fundamental pitch (F0), formant textures,
              accent cadence, and emotional baseline to build a high-fidelity synthetic voice clone.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-slate-950/70 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
            <button
              onClick={() => setSourceType("record")}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                sourceType === "record"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Record Live</span>
            </button>
            <button
              onClick={() => setSourceType("upload")}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                sourceType === "upload"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Audio</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Cloning Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Recording / Upload Studio (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {sourceType === "record" ? (
            /* LIVE RECORDING STUDIO */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <h2 className="text-base font-bold text-white">Live Microphone Studio</h2>
                </div>
                <div className="text-xs text-slate-400 flex items-center space-x-2">
                  <span>Target length:</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-cyan-300">
                    10–30s
                  </span>
                </div>
              </div>

              {/* Calibration Teleprompter Prompt Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-slate-300 flex items-center space-x-1.5">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Recommended Calibration Scripts (Read Aloud)</span>
                  </label>
                  <span className="text-slate-500">Phonetically balanced</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CALIBRATION_SCRIPTS.map((script) => (
                    <button
                      key={script.id}
                      onClick={() => {
                        setSelectedScriptId(script.id);
                        setCustomPromptText("");
                      }}
                      className={`text-left p-3 rounded-xl border text-xs transition-all ${
                        selectedScriptId === script.id && !customPromptText
                          ? "bg-cyan-950/50 border-cyan-500 text-cyan-200"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-semibold text-slate-200 truncate">{script.label}</div>
                      <div className="text-[10px] text-slate-500 mt-1">Est. {script.durationEst}</div>
                    </button>
                  ))}
                </div>

                {/* Teleprompter Box */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 relative">
                  <div className="text-xs uppercase tracking-wider text-cyan-500 font-bold mb-1">
                    Teleprompter Readout
                  </div>
                  <p className="text-sm sm:text-base font-serif text-slate-200 leading-relaxed italic">
                    "{currentScript}"
                  </p>
                </div>
              </div>

              {/* Canvas Waveform & Meters */}
              <div className="space-y-2">
                <div className="relative bg-slate-950 rounded-xl border border-slate-800 h-28 flex items-center justify-center overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={112}
                    className="w-full h-full object-cover"
                  />
                  {!isRecording && !recordedAudioUrl && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
                      Mic visualizer will activate upon recording
                    </div>
                  )}

                  {/* VU Decibel level overlay */}
                  {isRecording && (
                    <div className="absolute bottom-2 right-3 flex items-center space-x-2 bg-slate-900/80 px-2 py-1 rounded text-[11px] font-mono border border-slate-800">
                      <span className="text-slate-400">Level:</span>
                      <span
                        className={`font-bold ${
                          isClipping
                            ? "text-red-400"
                            : dbLevel > -15
                            ? "text-emerald-400"
                            : "text-amber-400"
                        }`}
                      >
                        {dbLevel} dBFS
                      </span>
                      {isClipping && (
                        <span className="px-1 bg-red-950 text-red-400 text-[9px] rounded font-bold uppercase">
                          Clip
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Recording Progress Bar & Timer */}
                <div className="flex items-center justify-between text-xs px-1 text-slate-400">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isRecording ? "bg-red-500 animate-ping" : "bg-slate-600"
                      }`}
                    />
                    <span>
                      {isRecording ? "Recording in progress..." : "Ready to record"}
                    </span>
                  </div>
                  <div className="font-mono text-sm text-cyan-400 font-bold">
                    00:{recordingSeconds.toString().padStart(2, "0")}
                  </div>
                </div>
              </div>

              {/* Mic error message */}
              {micError && (
                <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-xl flex items-center space-x-2 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{micError}</span>
                </div>
              )}

              {/* Recording Controls */}
              <div className="flex items-center space-x-4">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="flex-1 flex items-center justify-center space-x-2 bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-red-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-red-600/30 transition-all cursor-pointer transform active:scale-98"
                  >
                    <Mic className="w-5 h-5 animate-pulse" />
                    <span>{recordedAudioUrl ? "Record New Take" : "Start Voice Recording"}</span>
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex-1 flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 px-6 rounded-xl border border-slate-700 shadow-lg transition-all cursor-pointer"
                  >
                    <Square className="w-5 h-5 text-red-400 fill-red-400" />
                    <span>Stop Recording Take</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* FILE UPLOAD STUDIO */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div className="flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-base font-bold text-white">Import Vocal Sample</h2>
                </div>
                <span className="text-xs text-slate-400">WAV, MP3, M4A, WEBM, OGG</span>
              </div>

              <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/80 bg-slate-950/50 hover:bg-slate-950/80 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-800/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileAudio className="w-7 h-7 text-cyan-400" />
                </div>
                <p className="text-sm font-semibold text-slate-200 text-center">
                  Click to browse or drag audio sample here
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Optimal quality: Single speaker without heavy background music
                </p>
                {uploadedFileName && (
                  <div className="mt-4 px-3 py-1.5 rounded-lg bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 text-xs font-mono flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{uploadedFileName}</span>
                  </div>
                )}
              </label>
            </div>
          )}

          {/* Sample Review & Clone Trigger Bar */}
          {recordedAudioUrl && (
            <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-bold text-white">
                    Sample Ready for Acoustic Profiling
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {recordingSeconds > 0 ? `${recordingSeconds}s captured` : "Uploaded sample"}
                </span>
              </div>

              {/* Hidden audio element for preview */}
              <audio
                ref={previewAudioRef}
                src={recordedAudioUrl}
                onEnded={() => setIsPreviewPlaying(false)}
                className="hidden"
              />

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={togglePlayPreview}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                >
                  {isPreviewPlaying ? (
                    <>
                      <Pause className="w-4 h-4 text-cyan-400" />
                      <span>Pause Preview</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-cyan-400 fill-cyan-400" />
                      <span>Listen to Sample</span>
                    </>
                  )}
                </button>

                <div className="flex-1">
                  <input
                    type="text"
                    value={customCloneName}
                    onChange={(e) => setCustomCloneName(e.target.value)}
                    placeholder="Enter Voice Name (e.g. My Studio Voice)"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all"
                  />
                </div>

                <button
                  onClick={runVoiceCloningAnalysis}
                  disabled={isAnalyzing}
                  className="flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-600 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Profiling Acoustic Model...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Clone This Voice</span>
                    </>
                  )}
                </button>
              </div>

              {/* Progress indicator */}
              {isAnalyzing && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-cyan-300 font-medium">
                    <span className="flex items-center space-x-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{analysisStep}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">Gemini 3.8 Neural Analysis</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full w-2/3 animate-pulse" />
                  </div>
                </div>
              )}

              {analysisError && (
                <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl flex items-center space-x-2 text-xs text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{analysisError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Acoustic Profile & Neural Fingerprint (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl sticky top-24">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Neural Voice Fingerprint</h3>
              </div>
              {clonedProfile && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">
                  Acoustic Cloned
                </span>
              )}
            </div>

            {clonedProfile ? (
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Voice Header card */}
                <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${
                      clonedProfile.avatarColor || "from-cyan-400 to-indigo-600"
                    } flex items-center justify-center shadow-md font-bold text-lg text-white`}
                  >
                    {clonedProfile.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-extrabold text-white truncate">
                      {clonedProfile.name}
                    </h4>
                    <p className="text-xs text-cyan-400 font-medium">
                      {clonedProfile.genderClass}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      F0: {clonedProfile.pitchRangeHz}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Anchor</div>
                    <div className="text-xs font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800">
                      {clonedProfile.recommendedBaseVoice}
                    </div>
                  </div>
                </div>

                {/* Acoustic Clarity & Match Meter */}
                <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Sample Clarity & Signal-to-Noise:</span>
                    <span className="font-bold text-cyan-400">
                      {clonedProfile.sampleClarityScore}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-1000"
                      style={{ width: `${clonedProfile.sampleClarityScore}%` }}
                    />
                  </div>
                </div>

                {/* Timbre & Acoustic Traits */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">
                    Identified Acoustic Formants & Timbre:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {clonedProfile.timbreTraits.map((trait, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Cadence & Accent profile */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Cadence:</span>
                    <span className="text-slate-200 font-medium">
                      ~{clonedProfile.speechRateWpm} WPM
                    </span>
                  </div>
                  <div className="text-slate-300 text-[11px] leading-relaxed">
                    {clonedProfile.cadenceDescription}
                  </div>
                  <div className="pt-2 border-t border-slate-800/80 flex justify-between text-slate-400">
                    <span>Accent Nuance:</span>
                    <span className="text-cyan-300 font-medium text-right max-w-[60%] truncate">
                      {clonedProfile.accentProfile}
                    </span>
                  </div>
                </div>

                {/* Neural Style Prompt Directive */}
                <div className="space-y-1 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                    Generated Synthesis Directive (speechMetadata.style):
                  </div>
                  <p className="text-xs text-slate-300 font-mono italic leading-relaxed">
                    "{clonedProfile.stylePrompt}"
                  </p>
                </div>

                {/* CTA: Open in Synthesizer */}
                <button
                  onClick={() => onOpenInSynthesizer(clonedProfile)}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-slate-950" />
                  <span>Open in Studio Synthesizer</span>
                  <ChevronRight className="w-4 h-4 text-slate-950" />
                </button>
              </div>
            ) : (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center text-slate-500">
                  <AudioWaveformIcon />
                </div>
                <h4 className="text-sm font-semibold text-slate-300">
                  Awaiting Vocal Input
                </h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Record or upload a voice sample to view the neural frequency analysis,
                  formant spectrum, and custom cloning parameters.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AudioWaveformIcon = () => (
  <svg
    className="w-6 h-6 text-slate-500"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 10v3" />
    <path d="M6 6v11" />
    <path d="M10 3v18" />
    <path d="M14 8v7" />
    <path d="M18 5v13" />
    <path d="M22 10v3" />
  </svg>
);
