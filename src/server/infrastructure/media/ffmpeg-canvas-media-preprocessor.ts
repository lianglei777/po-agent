import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AppError } from "@/server/domain/app-error";
import type { CanvasMediaPreprocessor } from "@/server/ports/canvas-media-preprocessor";

const SAMPLE_RATE = 16_000;
const MAX_VIDEO_FRAMES = 6;
const PROCESS_TIMEOUT_MS = 120_000;
const MAX_VIDEO_ANALYSIS_SECONDS = 120;
const MAX_AUDIO_ANALYSIS_SECONDS = 300;
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;

export class FfmpegCanvasMediaPreprocessor implements CanvasMediaPreprocessor {
  constructor(
    private readonly ffmpegPath = process.env.PO_AGENT_FFMPEG_PATH || "ffmpeg",
    private readonly ffprobePath = process.env.PO_AGENT_FFPROBE_PATH || "ffprobe",
  ) {}

  async sampleVideo(input: Parameters<CanvasMediaPreprocessor["sampleVideo"]>[0]) {
    return this.withInputFile(input.name, input.mimeType, input.data, async (directory, inputPath) => {
      const durationSeconds = validDuration(input.durationSeconds)
        ? input.durationSeconds
        : await this.probeDuration(inputPath);
      const analyzedDurationSeconds = Math.min(durationSeconds, MAX_VIDEO_ANALYSIS_SECONDS);
      const frameCount = Math.min(MAX_VIDEO_FRAMES, Math.max(2, Math.ceil(analyzedDurationSeconds / 2)));
      const interval = analyzedDurationSeconds / frameCount;
      const outputPattern = path.join(directory, "frame-%02d.jpg");
      await runProcess(this.ffmpegPath, [
        "-y", "-hide_banner", "-loglevel", "error", "-i", inputPath,
        "-t", String(analyzedDurationSeconds),
        "-vf", `fps=1/${Math.max(interval, 0.1)},scale=1280:-2:force_original_aspect_ratio=decrease`,
        "-frames:v", String(frameCount), "-q:v", "3", outputPattern,
      ]);
      const files = (await fs.readdir(directory)).filter((name) => /^frame-\d+\.jpg$/u.test(name)).sort();
      if (!files.length) throw new AppError("PIPELINE_LLM_FAILED", "No video frames could be sampled", 422);
      return {
        durationSeconds,
        analyzedDurationSeconds,
        frames: await Promise.all(files.map(async (name, index) => ({
          timestampSeconds: round(index * interval),
          mimeType: "image/jpeg",
          data: new Uint8Array(await fs.readFile(path.join(directory, name))),
        }))),
      };
    });
  }

  async analyzeAudio(input: Parameters<CanvasMediaPreprocessor["analyzeAudio"]>[0]) {
    return this.withInputFile(input.name, input.mimeType, input.data, async (directory, inputPath) => {
      const pcmPath = path.join(directory, "audio.pcm");
      await runProcess(this.ffmpegPath, [
        "-y", "-hide_banner", "-loglevel", "error", "-i", inputPath,
        "-t", String(MAX_AUDIO_ANALYSIS_SECONDS),
        "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", pcmPath,
      ]);
      return analyzePcm(await fs.readFile(pcmPath));
    });
  }

  private async probeDuration(inputPath: string): Promise<number> {
    const { stdout } = await runProcess(this.ffprobePath, [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", inputPath,
    ]);
    const duration = Number(stdout.trim());
    if (!validDuration(duration)) throw new AppError("VALIDATION_ERROR", "The media duration could not be determined", 400);
    return duration;
  }

  private async withInputFile<T>(
    name: string,
    mimeType: string,
    data: Uint8Array,
    operation: (directory: string, inputPath: string) => Promise<T>,
  ): Promise<T> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "po-canvas-analysis-"));
    const inputPath = path.join(directory, `input${mediaExtension(name, mimeType)}`);
    try {
      await fs.writeFile(inputPath, data);
      return await operation(directory, inputPath);
    } catch (error) {
      if (isMissingExecutable(error)) {
        throw new AppError(
          "PIPELINE_MEDIA_PREPROCESSOR_UNAVAILABLE",
          "FFmpeg is required for video and audio analysis; configure PO_AGENT_FFMPEG_PATH and PO_AGENT_FFPROBE_PATH",
          503,
        );
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        "PIPELINE_MEDIA_ANALYSIS_FAILED",
        "FFmpeg could not decode the selected canvas media",
        422,
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
}

export function analyzePcm(data: Uint8Array) {
  const samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
  const windowSize = Math.round(SAMPLE_RATE * 0.1);
  const energies: number[] = [];
  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    let squareSum = 0;
    for (let index = start; index < start + windowSize; index += 1) {
      const normalized = samples[index]! / 32_768;
      squareSum += normalized * normalized;
    }
    energies.push(Math.sqrt(squareSum / windowSize));
  }
  if (!energies.length) {
    return { estimatedBpm: null, rhythm: "sparse" as const, dynamics: "low" as const,
      silenceRatio: 1, analyzedDurationSeconds: 0 };
  }
  const mean = average(energies);
  const deviation = Math.sqrt(average(energies.map((energy) => (energy - mean) ** 2)));
  const silenceRatio = energies.filter((energy) => energy < Math.max(0.006, mean * 0.15)).length / energies.length;
  const peaks = energies.flatMap((energy, index) => {
    const threshold = mean + deviation * 0.8;
    return energy > threshold && energy >= (energies[index - 1] ?? 0) && energy > (energies[index + 1] ?? 0)
      ? [index * 0.1] : [];
  });
  const intervals = peaks.slice(1).map((time, index) => time - peaks[index]!)
    .filter((interval) => interval >= 0.25 && interval <= 1.5);
  const medianInterval = median(intervals);
  const estimatedBpm = medianInterval ? Math.round(60 / medianInterval) : null;
  const variation = mean > 0 ? deviation / mean : 0;
  return {
    estimatedBpm,
    rhythm: silenceRatio > 0.45 ? "sparse" as const : variation > 0.75 ? "dynamic" as const : "steady" as const,
    dynamics: variation > 1 ? "high" as const : variation > 0.45 ? "medium" as const : "low" as const,
    silenceRatio: round(silenceRatio),
    analyzedDurationSeconds: round(samples.length / SAMPLE_RATE),
  };
}

function runProcess(executable: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error(`${executable} timed out`)));
    }, PROCESS_TIMEOUT_MS);
    const append = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finish(() => reject(new Error(`${executable} output exceeded the limit`)));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => code === 0
      ? resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") })
      : reject(new Error(Buffer.concat(stderr).toString("utf8") || `${executable} exited with ${code}`))));
  });
}

function mediaExtension(name: string, mimeType: string): string {
  const extension = path.extname(name).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/u.test(extension)) return extension;
  return ({ "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3",
    "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mp4": ".m4a", "audio/ogg": ".ogg" } as Record<string, string>)[mimeType] ?? ".bin";
}

function validDuration(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 86_400;
}

function isMissingExecutable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
