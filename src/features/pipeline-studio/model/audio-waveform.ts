import {
  MAX_CANVAS_AUDIO_UPLOAD_BYTES,
  type CanvasAudioMetadata,
  type CanvasWorkspaceFileRef,
} from "@/contracts/pipeline";

const AUDIO_FORMATS: Record<string, string> = {
  "audio/aac": "AAC",
  "audio/flac": "FLAC",
  "audio/mp4": "M4A",
  "audio/mpeg": "MP3",
  "audio/ogg": "OGG",
  "audio/opus": "OPUS",
  "audio/wav": "WAV",
  "audio/x-wav": "WAV",
};

export function buildAudioWaveformPeaks(channels: readonly Float32Array[], barCount: number): number[] {
  if (!Number.isInteger(barCount) || barCount <= 0 || channels.length === 0) return [];
  const frameCount = channels.reduce((largest, channel) => Math.max(largest, channel.length), 0);
  if (frameCount === 0) return Array.from({ length: barCount }, () => 0);

  const peaks = Array.from({ length: barCount }, (_, barIndex) => {
    const start = Math.floor((barIndex * frameCount) / barCount);
    const end = Math.max(start + 1, Math.floor(((barIndex + 1) * frameCount) / barCount));
    // 每个波形条最多采样约 512 帧，避免长音频在主线程执行无界遍历。
    const stride = Math.max(1, Math.floor((end - start) / 512));
    let peak = 0;
    for (const channel of channels) {
      const channelEnd = Math.min(end, channel.length);
      for (let frame = start; frame < channelEnd; frame += stride) {
        peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
      }
    }
    return peak;
  });
  const maximum = Math.max(...peaks);
  return maximum > 0 ? peaks.map((peak) => peak / maximum) : peaks;
}

export function audioFormatLabel(file: CanvasWorkspaceFileRef | undefined): string | null {
  if (!file) return null;
  const byMime = AUDIO_FORMATS[file.contentType.toLowerCase()];
  if (byMime) return byMime;
  const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
  return extension && extension.length <= 8 ? extension : null;
}

export function isAudioFile(file: Pick<File, "name" | "type">): boolean {
  return file.type.toLowerCase().startsWith("audio/") || /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(file.name);
}

export function audioFileProblem(file: Pick<File, "name" | "type" | "size">): "unsupported" | "too-large" | null {
  if (!isAudioFile(file)) return "unsupported";
  return file.size > MAX_CANVAS_AUDIO_UPLOAD_BYTES ? "too-large" : null;
}

export function formatAudioDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(wholeSeconds / 3_600);
  const minutes = Math.floor((wholeSeconds % 3_600) / 60);
  const tail = `${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(wholeSeconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${tail}` : tail;
}

export function audioMetadataEqual(left: CanvasAudioMetadata | undefined, right: CanvasAudioMetadata): boolean {
  return left?.durationSeconds === right.durationSeconds
    && left.format === right.format
    && left.sampleRateHz === right.sampleRateHz
    && left.channelCount === right.channelCount;
}
