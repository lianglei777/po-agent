import { describe, expect, it } from "vitest";
import {
  canvasSaveErrorIsRetryable,
  canvasSaveRetryDelay,
  PipelineStudioApiError,
} from "./pipeline-studio-api";

describe("pipeline studio autosave retry policy", () => {
  it("retries transient failures but stops on client and revision errors", () => {
    expect(canvasSaveErrorIsRetryable(new TypeError("network failed"))).toBe(true);
    expect(canvasSaveErrorIsRetryable(new PipelineStudioApiError("unavailable", 503))).toBe(true);
    expect(canvasSaveErrorIsRetryable(new PipelineStudioApiError("invalid", 400))).toBe(false);
    expect(canvasSaveErrorIsRetryable(new PipelineStudioApiError("revision conflict", 409))).toBe(false);
  });

  it("backs off retries and caps the delay", () => {
    expect([0, 1, 2, 3].map(canvasSaveRetryDelay)).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(canvasSaveRetryDelay(20)).toBe(30_000);
  });
});
