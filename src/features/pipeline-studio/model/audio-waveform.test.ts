import { describe, expect, it } from "vitest";
import {
  audioFileProblem,
  audioFormatLabel,
  audioMetadataEqual,
  buildAudioWaveformPeaks,
  formatAudioDuration,
  isAudioFile,
} from "./audio-waveform";

describe("audio waveform", () => {
  it("builds a bounded normalized waveform across channels", () => {
    const peaks = buildAudioWaveformPeaks([
      new Float32Array([0, 0.25, -0.5, 1, 0.2, 0.1, 0.4, 0.8]),
      new Float32Array([0.1, 0.2, 0.25, 0.5, 0.3, 0.2, 0.1, 0.4]),
    ], 4);

    expect(peaks).toHaveLength(4);
    expect(Math.max(...peaks)).toBe(1);
    expect(peaks.every((peak) => peak >= 0 && peak <= 1)).toBe(true);
  });

  it("keeps silent and empty inputs stable", () => {
    expect(buildAudioWaveformPeaks([new Float32Array(8)], 3)).toEqual([0, 0, 0]);
    expect(buildAudioWaveformPeaks([], 8)).toEqual([]);
    expect(buildAudioWaveformPeaks([new Float32Array([1])], 0)).toEqual([]);
  });

  it("recognizes supported audio MIME types and extensions", () => {
    expect(isAudioFile({ name: "voice.bin", type: "audio/mpeg" })).toBe(true);
    expect(isAudioFile({ name: "ambience.FLAC", type: "" })).toBe(true);
    expect(isAudioFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
    expect(audioFormatLabel({ name: "voice.unknown", contentType: "audio/mpeg", relativePath: "voice" })).toBe("MP3");
    expect(audioFormatLabel({ name: "ambience.flac", contentType: "", relativePath: "ambience" })).toBe("FLAC");
  });

  it("rejects audio uploads larger than 10 MiB before sending them", () => {
    expect(audioFileProblem({ name: "voice.mp3", type: "audio/mpeg", size: 10 * 1024 * 1024 })).toBeNull();
    expect(audioFileProblem({ name: "voice.mp3", type: "audio/mpeg", size: 10 * 1024 * 1024 + 1 })).toBe("too-large");
    expect(audioFileProblem({ name: "notes.txt", type: "text/plain", size: 10 })).toBe("unsupported");
  });

  it("formats long durations and compares persisted metadata", () => {
    expect(formatAudioDuration(65.4)).toBe("1:05");
    expect(formatAudioDuration(3_661)).toBe("1:01:01");
    const metadata = { durationSeconds: 5.2, format: "WAV", sampleRateHz: 48_000, channelCount: 2 };
    expect(audioMetadataEqual(metadata, metadata)).toBe(true);
    expect(audioMetadataEqual({ ...metadata, channelCount: 1 }, metadata)).toBe(false);
  });
});
