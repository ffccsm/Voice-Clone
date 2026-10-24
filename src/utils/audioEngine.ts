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
      const barWidth = (width / barCount) - 3;
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
