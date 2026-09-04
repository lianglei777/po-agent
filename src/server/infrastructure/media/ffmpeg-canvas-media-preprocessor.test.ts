import { describe, expect, it } from "vitest";
import { analyzePcm, FfmpegCanvasMediaPreprocessor } from "./ffmpeg-canvas-media-preprocessor";

describe("analyzePcm", () => {
  it("estimates a steady pulse tempo without retaining audio samples", () => {
    const sampleRate = 16_000;
    const samples = new Int16Array(sampleRate * 6);
    for (let beat = 0; beat < 12; beat += 1) {
      const start = Math.round(beat * 0.5 * sampleRate);
      for (let index = start; index < start + sampleRate * 0.08; index += 1) {
        samples[index] = 24_000;
      }
    }
    const result = analyzePcm(new Uint8Array(samples.buffer));
    expect(result.estimatedBpm).toBe(120);
    expect(result.analyzedDurationSeconds).toBe(6);
    expect(result.silenceRatio).toBeGreaterThan(0.5);
  });

  it("handles empty or too-short decoded audio", () => {
    expect(analyzePcm(new Uint8Array())).toEqual({
      estimatedBpm: null, rhythm: "sparse", dynamics: "low", silenceRatio: 1, analyzedDurationSeconds: 0,
    });
  });

  it("returns an actionable error when FFmpeg is unavailable", async () => {
    const preprocessor = new FfmpegCanvasMediaPreprocessor("missing-po-ffmpeg", "missing-po-ffprobe");
    await expect(preprocessor.sampleVideo({
      name: "clip.mp4", mimeType: "video/mp4", data: new Uint8Array([1]), durationSeconds: 2,
    })).rejects.toMatchObject({ code: "PIPELINE_MEDIA_PREPROCESSOR_UNAVAILABLE", status: 503 });
  });
});
