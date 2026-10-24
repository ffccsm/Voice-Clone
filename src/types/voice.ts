export interface TuningConfig {
  bassBoostDb: number;
  trebleDb: number;
  pitchShiftSemitones: number;
  recommendedPlaybackRate: number;
}

export interface VoiceCloneProfile {
  id: string;
  name: string;
  avatarColor?: string;
  genderClass: string;
  pitchRangeHz: string;
  recommendedBaseVoice: "Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr";
  speechRateWpm: number;
  cadenceDescription: string;
  timbreTraits: string[];
  accentProfile: string;
  emotionalBaseline: string;
  stylePrompt: string;
  sampleClarityScore: number;
  transcription?: string;
  originalAudioUrl?: string; // Data URL or Blob URL
  tuningRecommendations: TuningConfig;
  isPreset?: boolean;
  createdAt: string;
}

export interface SynthesizedAudio {
  id: string;
  profileId: string;
  profileName: string;
  text: string;
  audioBase64: string;
  audioUrl: string;
  duration?: number;
  timestamp: string;
  stylePrompt: string;
  baseVoice: string;
  model: string;
}

export interface ScriptSuggestion {
  category: string;
  title: string;
  text: string;
  estimatedDurationSec: number;
}
