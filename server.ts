import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Support large audio base64 payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

function resolveApiKey(): string {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const devEnvPath = "/app/.dev.env.json";
    if (fs.existsSync(devEnvPath)) {
      const parsed = JSON.parse(fs.readFileSync(devEnvPath, "utf-8"));
      if (parsed.GEMINI_API_KEY) {
        return parsed.GEMINI_API_KEY;
      }
    }
  } catch {
    // Ignore fallback read errors
  }
  return "";
}

function getAiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: resolveApiKey(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function safeParseJson<T>(rawText: string | undefined, fallback: T): T {
  if (!rawText) return fallback;
  let cleaned = rawText.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try extracting the first JSON object or array
    const objMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[1]) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function formatErrorMessage(error: any, defaultMsg: string): string {
  if (!error) return defaultMsg;
  const rawMsg = typeof error === "string" ? error : error.message || defaultMsg;
  try {
    const parsed = JSON.parse(rawMsg);
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
    if (parsed?.message) {
      return parsed.message;
    }
  } catch {
    // Not a JSON string
  }
  return rawMsg;
}

// API: Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(resolveApiKey()),
    time: new Date().toISOString(),
  });
});

// API: Analyze voice sample to create acoustic profile
app.post("/api/clone/analyze", async (req, res) => {
  try {
    const {
      audioData,
      mimeType = "audio/webm",
      sampleName = "My Voice Sample",
      genderHint = "auto",
      measuredPitchHz,
      pitchRangeLabel,
    } = req.body || {};

    if (!audioData || typeof audioData !== "string") {
      return res.status(400).json({ error: "Missing audioData (base64 string)" });
    }

    // Strip data URL prefix if present
    const base64Data = audioData.includes(",")
      ? audioData.split(",")[1].trim()
      : audioData.trim();

    // Strip codec parameters (e.g. "audio/webm;codecs=opus" -> "audio/webm")
    const cleanMimeType =
      (mimeType || "audio/webm").split(";")[0].trim().toLowerCase() || "audio/webm";

    const acousticContext = [
      genderHint && genderHint !== "auto"
        ? `CRITICAL USER-SPECIFIED SPEAKER GENDER: ${String(genderHint).toUpperCase()}. You MUST respect this gender!`
        : "",
      measuredPitchHz
        ? `CLIENT DSP MEASURED FUNDAMENTAL FREQUENCY (F0): ~${measuredPitchHz} Hz (Range: ${
            pitchRangeLabel || `${measuredPitchHz - 20}Hz - ${measuredPitchHz + 25}Hz`
          }). Note: Male human voices have F0 < 165 Hz (75Hz-165Hz); Female human voices have F0 >= 165 Hz (165Hz-265Hz).`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `You are a world-class acoustic scientist, speech pathologist, and neural voice synthesis director.
Analyze this human voice audio sample with extreme precision to construct an authentic Neural Voice Clone Profile.
${acousticContext ? `\n${acousticContext}\n` : ""}
Perform deep acoustic evaluation:
1. Transcription: What did the speaker say?
2. Gender & Pitch Class: (e.g. Male Baritone, Male Tenor, Deep Male Bass, Female Mezzo-Soprano, Female Contralto)
3. Estimated Fundamental Frequency (F0): Range in Hz (e.g., 95Hz - 145Hz for Male, 175Hz - 230Hz for Female)
4. Prebuilt Voice Anchor: Pick strictly according to speaker gender:
   - IF MALE SPEAKER, MUST PICK ONE OF:
     * 'Charon' (deep, warm, resonant, authoritative MALE baritone)
     * 'Fenrir' (deep, rugged, chest-resonant MALE bass-baritone)
     * 'Puck' (clear, energetic, natural MALE tenor/baritone)
   - IF FEMALE SPEAKER, MUST PICK ONE OF:
     * 'Kore' (warm, soothing, lyrical FEMALE contralto/mezzo)
     * 'Zephyr' (crisp, articulate, bright FEMALE mezzo-soprano)
   NEVER pick 'Kore' or 'Zephyr' for a male speaker! NEVER pick 'Charon', 'Fenrir', or 'Puck' for a female speaker!
5. Speech Rate & Cadence: WPM estimate, rhythmic structure.
6. Timbre & Formant Fingerprint: 3-5 distinct acoustic traits.
7. Accent & Dialect markers: Describe their accent, inflection nuances, and vowel elongation.
8. Style Prompt: A rich, promptable style directive (2-3 sentences) suitable for Gemini TTS speechMetadata.style to make the prebuilt voice emulate this speaker's exact gender, timbre, emotional tone, pace, and vocal textures.
9. Acoustic Similarity Score (0-100%): Sample recording quality and acoustic clarity rating.
10. Recommended EQ / Tuning: Suggested micro-tuning: bassBoostDb (-6 to +6), trebleDb (-6 to +6), recommendedPlaybackRate (0.85 to 1.15).

Return strictly JSON matching this structure.`;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: cleanMimeType,
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
            voiceName: {
              type: Type.STRING,
              description: "Suggested evocative name for this cloned voice profile",
            },
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
              required: [
                "bassBoostDb",
                "trebleDb",
                "pitchShiftSemitones",
                "recommendedPlaybackRate",
              ],
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

    const parsed = safeParseJson<Record<string, any>>(response.text, {});

    // Determine authoritative gender from user hint, DSP pitch measurement, or model output
    const rawGenderClass = String(parsed.genderClass || "").toLowerCase();
    let isMaleSpeaker = true;
    if (genderHint === "male") {
      isMaleSpeaker = true;
    } else if (genderHint === "female") {
      isMaleSpeaker = false;
    } else if (typeof measuredPitchHz === "number" && measuredPitchHz > 0) {
      isMaleSpeaker = measuredPitchHz < 165;
    } else if (
      rawGenderClass.includes("female") ||
      rawGenderClass.includes("woman") ||
      rawGenderClass.includes("soprano") ||
      rawGenderClass.includes("contralto")
    ) {
      isMaleSpeaker = false;
    } else if (
      rawGenderClass.includes("male") ||
      rawGenderClass.includes("baritone") ||
      rawGenderClass.includes("tenor") ||
      rawGenderClass.includes("bass")
    ) {
      isMaleSpeaker = true;
    }

    const maleVoices = ["Charon", "Fenrir", "Puck"];
    const femaleVoices = ["Kore", "Zephyr"];
    let finalBaseVoice = parsed.recommendedBaseVoice;

    if (isMaleSpeaker) {
      if (!maleVoices.includes(finalBaseVoice)) {
        if (typeof measuredPitchHz === "number" && measuredPitchHz < 108) {
          finalBaseVoice = "Fenrir";
        } else if (typeof measuredPitchHz === "number" && measuredPitchHz > 142) {
          finalBaseVoice = "Puck";
        } else {
          finalBaseVoice = "Charon";
        }
      }
    } else {
      if (!femaleVoices.includes(finalBaseVoice)) {
        finalBaseVoice =
          typeof measuredPitchHz === "number" && measuredPitchHz >= 205 ? "Zephyr" : "Kore";
      }
    }

    let finalGenderClass = parsed.genderClass || (isMaleSpeaker ? "Male Baritone" : "Female Mezzo-Soprano");
    if (isMaleSpeaker && /female|soprano|contralto/i.test(finalGenderClass)) {
      finalGenderClass =
        finalBaseVoice === "Fenrir"
          ? "Deep Male Bass-Baritone"
          : finalBaseVoice === "Puck"
          ? "Male Tenor"
          : "Male Baritone";
    } else if (!isMaleSpeaker && /\bmale\b|baritone|tenor|bass/i.test(finalGenderClass)) {
      finalGenderClass = finalBaseVoice === "Zephyr" ? "Female Mezzo-Soprano" : "Female Contralto";
    }

    const finalPitchRange =
      pitchRangeLabel ||
      parsed.pitchRangeHz ||
      (isMaleSpeaker ? "95Hz - 145Hz" : "175Hz - 230Hz");

    let finalStylePrompt =
      parsed.stylePrompt ||
      (isMaleSpeaker
        ? "Speak in a natural, resonant masculine voice with warm chest resonance and clear articulation."
        : "Speak in a natural, warm feminine voice with expressive clarity and smooth cadence.");

    if (isMaleSpeaker && !/\bmale\b|\bmasculine\b|\bbaritone\b|\btenor\b/i.test(finalStylePrompt)) {
      finalStylePrompt = `Natural masculine male voice with warm chest resonance. ${finalStylePrompt}`;
    }

    res.json({
      success: true,
      profile: {
        id: "clone_" + Date.now(),
        name: parsed.voiceName || sampleName,
        ...parsed,
        genderClass: finalGenderClass,
        pitchRangeHz: finalPitchRange,
        recommendedBaseVoice: finalBaseVoice,
        speechRateWpm: parsed.speechRateWpm || 135,
        cadenceDescription: parsed.cadenceDescription || "Natural conversational rhythm",
        timbreTraits: Array.isArray(parsed.timbreTraits)
          ? parsed.timbreTraits
          : [isMaleSpeaker ? "Warm chest resonance" : "Clear vocal warmth", "Crisp articulation"],
        accentProfile: parsed.accentProfile || "Neutral",
        emotionalBaseline: parsed.emotionalBaseline || "Warm and expressive",
        stylePrompt: finalStylePrompt,
        sampleClarityScore: parsed.sampleClarityScore || 94,
        tuningRecommendations: parsed.tuningRecommendations || {
          bassBoostDb: isMaleSpeaker ? 2.5 : 1.0,
          trebleDb: 0.5,
          pitchShiftSemitones: 0,
          recommendedPlaybackRate: 1.0,
        },
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error in /api/clone/analyze:", error);
    res.status(500).json({
      error: formatErrorMessage(error, "Failed to analyze voice sample"),
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
      model = "gemini-3.8-flash-tts",
    } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Text prompt is required" });
    }

    const validVoices = ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"];
    const voiceName = validVoices.includes(baseVoice) ? baseVoice : "Charon";
    const selectedModel =
      model === "gemini-3.8-flash-lite-tts"
        ? "gemini-3.8-flash-lite-tts"
        : "gemini-3.8-flash-tts";

    const ai = getAiClient();
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

    // Iterate parts to find the audio inlineData
    const parts = response.candidates?.[0]?.content?.parts || [];
    let base64Audio: string | undefined;
    for (const part of parts) {
      if (part.inlineData?.data) {
        base64Audio = part.inlineData.data;
        break;
      }
    }

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
      error: formatErrorMessage(error, "Speech synthesis failed"),
    });
  }
});

// API: Generate script suggestions for the cloned persona
app.post("/api/clone/script-suggest", async (req, res) => {
  try {
    const { profile } = req.body || {};

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

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
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

    const scripts = safeParseJson<any[]>(response.text, []);
    res.json({ success: true, scripts });
  } catch (error: any) {
    console.error("Error in /api/clone/script-suggest:", error);
    res.status(500).json({
      error: formatErrorMessage(error, "Failed to generate scripts"),
    });
  }
});

// Catch-all for unmatched /api/* routes so they never fall through to HTML SPA fallback
app.all("/api/*", (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global JSON error handler for body-parser / middleware errors so Express never returns HTML error pages
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (res.headersSent) {
      return next(err);
    }
    console.error("Express middleware error:", err);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: formatErrorMessage(err, "Internal server error"),
    });
  }
);

// Server setup: Vite middleware in dev, static in prod
async function startServer() {
  const isProd =
    process.env.NODE_ENV === "production" ||
    Boolean(process.argv[1] && process.argv[1].endsWith("server.js"));

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
