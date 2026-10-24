import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Support large audio base64 payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize Google GenAI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// API: Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// API: Analyze voice sample to create acoustic profile
app.post("/api/clone/analyze", async (req, res) => {
  try {
    const { audioData, mimeType = "audio/webm", sampleName = "My Voice Sample" } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: "Missing audioData (base64 string)" });
    }

    // Strip data URL prefix if present
    const base64Data = audioData.includes(",")
      ? audioData.split(",")[1]
      : audioData;

    const prompt = `You are a world-class acoustic scientist, speech pathologist, and neural voice synthesis director.
Analyze this human voice audio sample with extreme precision to construct an authentic Neural Voice Clone Profile.

Perform deep acoustic evaluation:
1. Transcription: What did the speaker say?
2. Gender & Pitch Class: (e.g. Male Baritone, Female Mezzo-Soprano, Androgynous Tenor, etc.)
3. Estimated Fundamental Frequency (F0): Range in Hz (e.g., 95Hz - 145Hz)
4. Prebuilt Voice Anchor: Which prebuilt Gemini voice is the closest acoustic timbre match? Pick strictly one of: 'Puck' (youthful, expressive, playful), 'Charon' (deep, resonant, authoritative baritone), 'Kore' (warm, soothing, lyrical female), 'Fenrir' (gravelly, rugged, deep masculine), 'Zephyr' (crisp, articulate, bright neutral/female).
5. Speech Rate & Cadence: WPM estimate, rhythmic structure (e.g., measured and contemplative, fast and enthusiastic, staccato, melodic).
6. Timbre & Formant Fingerprint: 3-5 distinct acoustic traits (e.g., "Warm chest resonance", "Slight breathy vocal fry at phrase endings", "Crisp dental articulation", "Rich lower harmonic warmth").
7. Accent & Dialect markers: Describe their accent, inflection nuances, and vowel elongation.
8. Style Prompt: A rich, promptable style directive (2-3 sentences) suitable for Gemini TTS speechMetadata.style to make the prebuilt voice emulate this speaker's timbre, emotional tone, pace, and vocal textures.
9. Acoustic Similarity Score (0-100%): Sample recording quality and acoustic clarity rating.
10. Recommended EQ / Tuning: Suggested micro-tuning: bassBoostDb (-6 to +6), trebleDb (-6 to +6), recommendedPlaybackRate (0.85 to 1.15).

Return strictly JSON matching this structure.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "audio/webm",
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: { type: Type.STRING },
            voiceName: { type: Type.STRING, description: "Suggested evocative name for this cloned voice profile" },
            genderClass: { type: Type.STRING },
            pitchRangeHz: { type: Type.STRING },
            recommendedBaseVoice: {
              type: Type.STRING,
              enum: ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"],
            },
            speechRateWpm: { type: Type.INTEGER },
            cadenceDescription: { type: Type.STRING },
            timbreTraits: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            accentProfile: { type: Type.STRING },
            emotionalBaseline: { type: Type.STRING },
            stylePrompt: {
              type: Type.STRING,
              description: "Precise style directive for Gemini TTS speechMetadata.style",
            },
            sampleClarityScore: { type: Type.INTEGER },
            tuningRecommendations: {
              type: Type.OBJECT,
              properties: {
                bassBoostDb: { type: Type.NUMBER },
                trebleDb: { type: Type.NUMBER },
                pitchShiftSemitones: { type: Type.NUMBER },
                recommendedPlaybackRate: { type: Type.NUMBER },
              },
              required: ["bassBoostDb", "trebleDb", "pitchShiftSemitones", "recommendedPlaybackRate"],
            },
          },
          required: [
            "transcription",
            "voiceName",
            "genderClass",
            "pitchRangeHz",
            "recommendedBaseVoice",
            "speechRateWpm",
            "cadenceDescription",
            "timbreTraits",
            "accentProfile",
            "emotionalBaseline",
            "stylePrompt",
            "sampleClarityScore",
            "tuningRecommendations",
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({
      success: true,
      profile: {
        id: "clone_" + Date.now(),
        name: parsed.voiceName || sampleName,
        createdAt: new Date().toISOString(),
        ...parsed,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/clone/analyze:", error);
    res.status(500).json({
      error: error.message || "Failed to analyze voice sample",
    });
  }
});

// API: Synthesize speech using the cloned voice parameters
app.post("/api/clone/synthesize", async (req, res) => {
  try {
    const {
      text,
      baseVoice = "Charon",
      stylePrompt,
      model = "gemini-3.8-flash-tts", // or gemini-3.8-flash-lite-tts
    } = req.body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Text prompt is required" });
    }

    const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
    const voiceName = validVoices.includes(baseVoice) ? baseVoice : "Kore";
    const selectedModel =
      model === "gemini-3.8-flash-lite-tts"
        ? "gemini-3.8-flash-lite-tts"
        : "gemini-3.8-flash-tts";

    // Use Gemini 3.8 TTS unary generateContent
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: text.trim(),
              ...(stylePrompt
                ? {
                    speechMetadata: {
                      style: stylePrompt,
                    },
                  }
                : {}),
            },
          ],
        },
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    // Unary default: complete WAV file (audio/wav, RIFF header, 24kHz mono 16-bit)
    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("No audio was returned from speech synthesis model");
    }

    res.json({
      success: true,
      audioBase64: base64Audio,
      mimeType: "audio/wav",
      sampleRate: 24000,
      format: "wav",
    });
  } catch (error: any) {
    console.error("Error in /api/clone/synthesize:", error);
    res.status(500).json({
      error: error.message || "Speech synthesis failed",
    });
  }
});

// API: Generate script suggestions for the cloned persona
app.post("/api/clone/script-suggest", async (req, res) => {
  try {
    const { profile, topic = "general" } = req.body;

    const prompt = `You are a scriptwriter for speech synthesis and voice cloning demonstrations.
Given this voice clone persona:
- Name: ${profile?.name || "Cloned Voice"}
- Gender & Class: ${profile?.genderClass || "Neutral"}
- Timbre: ${profile?.timbreTraits?.join(", ") || "Clear and articulate"}
- Accent: ${profile?.accentProfile || "Standard"}
- Style: ${profile?.stylePrompt || "Natural"}

Generate 5 distinct, high-impact demonstration scripts that show off this voice's unique timbre, emotional resonance, and vocal dynamics:
1. Podcast/Storyteller Intro (expressive, narrative)
2. Cinematic Trailer or Motivational Hook (dynamic, dramatic)
3. Conversational AI Assistant Response (warm, helpful)
4. High-Tech Keynote Announcement (confident, visionary)
5. Expressive Dialogue with natural vocal tags (e.g. <breath>, <laugh>, |yeah|)

Return strictly JSON with an array of script objects.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              title: { type: Type.STRING },
              text: { type: Type.STRING },
              estimatedDurationSec: { type: Type.INTEGER },
            },
            required: ["category", "title", "text", "estimatedDurationSec"],
          },
        },
      },
    });

    const scripts = JSON.parse(response.text || "[]");
    res.json({ success: true, scripts });
  } catch (error: any) {
    console.error("Error in /api/clone/script-suggest:", error);
    res.status(500).json({ error: error.message || "Failed to generate scripts" });
  }
});

// Server setup: Vite middleware in dev, static in prod
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VoxClone AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
