/**
 * Web Audio Engine utilities for VoxClone AI
 */

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioContext = new AudioCtx({ sampleRate: 24000 });
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

/**
 * Converts a base64 string to a Blob URL for playback
 */
export function base64ToBlobUrl(base64Data: string, mimeType = "audio/wav"): string {
  const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const binaryString = window.atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Converts a Blob or File to Base64 string
 */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Measures the speaker's true Fundamental Frequency (F0 in Hz) from a recorded or uploaded Audio Blob
 * using time-domain autocorrelation across voiced speech frames.
 * Male vocal range: ~75Hz - 165Hz | Female vocal range: ~165Hz - 265Hz
 */
export async function detectPitchFromAudioBlob(blob: Blob): Promise<{
  medianF0: number;
  minF0: number;
  maxF0: number;
  detectedGender: "male" | "female";
  pitchRangeLabel: string;
  genderClassLabel: string;
  recommendedMaleOrFemaleAnchor: "Charon" | "Fenrir" | "Puck" | "Kore" | "Zephyr";
} | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const tempCtx = new AudioCtx();
    const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const frameSize = Math.floor(sampleRate * 0.04); // 40ms window
    const hopSize = Math.floor(sampleRate * 0.02); // 20ms hop
    const minLag = Math.floor(sampleRate / 300); // Max 300 Hz
    const maxLag = Math.floor(sampleRate / 65); // Min 65 Hz

    const f0Estimates: number[] = [];

    for (let start = 0; start + frameSize < channelData.length; start += hopSize) {
      // Compute RMS energy to check if frame is voiced speech
      let sumSq = 0;
      for (let i = 0; i < frameSize; i++) {
        const s = channelData[start + i];
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / frameSize);
      if (rms < 0.015) continue; // Skip silence/unvoiced frames

      // Normalized autocorrelation within human vocal F0 range (65Hz - 300Hz)
      let bestLag = -1;
      let bestCorr = 0;

      for (let lag = minLag; lag <= maxLag && start + lag + frameSize < channelData.length; lag++) {
        let corr = 0;
        let normA = 0;
        let normB = 0;
        // Subsample by 2 for fast computation
        for (let i = 0; i < frameSize; i += 2) {
          const a = channelData[start + i];
          const b = channelData[start + i + lag];
          corr += a * b;
          normA += a * a;
          normB += b * b;
        }
        const denom = Math.sqrt(normA * normB);
        const normalized = denom > 0 ? corr / denom : 0;
        if (normalized > bestCorr) {
          bestCorr = normalized;
          bestLag = lag;
        }
      }

      if (bestLag > 0 && bestCorr > 0.55) {
        const f0 = sampleRate / bestLag;
        if (f0 >= 70 && f0 <= 290) {
          f0Estimates.push(f0);
        }
      }
    }

    await tempCtx.close().catch(() => {});

    if (f0Estimates.length === 0) {
      return null;
    }

    f0Estimates.sort((a, b) => a - b);
    const p15 = Math.round(f0Estimates[Math.floor(f0Estimates.length * 0.15)]);
    const medianF0 = Math.round(f0Estimates[Math.floor(f0Estimates.length * 0.5)]);
    const p85 = Math.round(f0Estimates[Math.floor(f0Estimates.length * 0.85)]);

    const minF0 = Math.max(70, Math.min(p15, medianF0 - 15));
    const maxF0 = Math.min(285, Math.max(p85, medianF0 + 20));
    const detectedGender: "male" | "female" = medianF0 < 165 ? "male" : "female";

    let genderClassLabel = "Male Baritone";
    let recommendedMaleOrFemaleAnchor: "Charon" | "Fenrir" | "Puck" | "Kore" | "Zephyr" = "Charon";

    if (detectedGender === "male") {
      if (medianF0 < 108) {
        genderClassLabel = "Deep Male Bass-Baritone";
        recommendedMaleOrFemaleAnchor = "Fenrir";
      } else if (medianF0 <= 140) {
        genderClassLabel = "Male Baritone";
        recommendedMaleOrFemaleAnchor = "Charon";
      } else {
        genderClassLabel = "Male Tenor";
        recommendedMaleOrFemaleAnchor = "Puck";
      }
    } else {
      if (medianF0 < 205) {
        genderClassLabel = "Female Contralto / Mezzo";
        recommendedMaleOrFemaleAnchor = "Kore";
      } else {
        genderClassLabel = "Female Mezzo-Soprano";
        recommendedMaleOrFemaleAnchor = "Zephyr";
      }
    }

    return {
      medianF0,
      minF0,
      maxF0,
      detectedGender,
      pitchRangeLabel: `${minF0}Hz - ${maxF0}Hz`,
      genderClassLabel,
      recommendedMaleOrFemaleAnchor,
    };
  } catch (e) {
    console.warn("Pitch detection fallback:", e);
    return null;
  }
}

/**
 * Draw animated dynamic waveform on canvas
 */
export function drawVisualizer(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  mode: "wave" | "bars" = "wave",
  accentColor = "#06b6d4"
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  let animationFrameId: number;

  const render = () => {
    animationFrameId = requestAnimationFrame(render);
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (mode === "wave") {
      analyser.getByteTimeDomainData(dataArray);

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = accentColor;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Soft glow effect
      ctx.shadowBlur = 8;
      ctx.shadowColor = accentColor;
    } else {
      analyser.getByteFrequencyData(dataArray);

      const barCount = 36;
      const barWidth = width / barCount - 3;
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step];
        const percent = value / 255;
        const barHeight = Math.max(4, percent * height * 0.9);
        const x = i * (barWidth + 3);
        const y = height - barHeight;

        // Gradient from accent to purple
        const gradient = ctx.createLinearGradient(0, height, 0, y);
        gradient.addColorStop(0, accentColor);
        gradient.addColorStop(1, "#8b5cf6");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    }
  };

  render();

  return () => {
    cancelAnimationFrame(animationFrameId);
  };
}

/**
 * Calculates current RMS decibels from analyser
 */
export function calculateDecibels(analyser: AnalyserNode): { db: number; isClipping: boolean } {
  const bufferLength = analyser.fftSize;
  const dataArray = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(dataArray);

  let sum = 0;
  let maxPeak = 0;
  for (let i = 0; i < bufferLength; i++) {
    const val = dataArray[i];
    sum += val * val;
    if (Math.abs(val) > maxPeak) maxPeak = Math.abs(val);
  }

  const rms = Math.sqrt(sum / bufferLength);
  // Convert to dBFS (0 dB is maximum)
  const db = rms > 0.00001 ? 20 * Math.log10(rms) : -100;
  const isClipping = maxPeak >= 0.98;

  return { db: Math.max(-60, Math.min(0, Math.round(db))), isClipping };
}
