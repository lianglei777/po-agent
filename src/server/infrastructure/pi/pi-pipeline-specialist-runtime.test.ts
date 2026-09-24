import { describe, expect, it, vi } from "vitest";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PiPipelineSpecialistRuntime } from "./pi-pipeline-specialist-runtime";

describe("PiPipelineSpecialistRuntime", () => {
  it("falls back to schema-validated plain JSON when a provider rejects response_format", async () => {
    const completeSimple = vi.fn()
      .mockResolvedValueOnce(message("error", [], "400 InvalidParameter while generating a JSON response for response_format"))
      .mockResolvedValueOnce(message("stop", [{ type: "text", text: '{"kind":"script"}' }]));
    const runtime = new PiPipelineSpecialistRuntime(Promise.resolve({
      getModel: vi.fn().mockReturnValue({ provider: "provider", id: "model" }),
      getAvailableSnapshot: vi.fn().mockReturnValue([]),
      completeSimple,
    } as unknown as ModelRuntime));

    await expect(runtime.run(request())).resolves.toBe('{"kind":"script"}');
    expect(completeSimple).toHaveBeenCalledTimes(2);
    expect(completeSimple.mock.calls[0]?.[2]).toMatchObject({ samplingParams: { response_format: { type: "json_object" } } });
    expect(completeSimple.mock.calls[1]?.[2]).not.toHaveProperty("samplingParams");
  });

  it("does not retry unrelated provider failures", async () => {
    const completeSimple = vi.fn().mockResolvedValue(message("error", [], "401 invalid credential"));
    const runtime = new PiPipelineSpecialistRuntime(Promise.resolve({
      getModel: vi.fn().mockReturnValue({ provider: "provider", id: "model" }),
      getAvailableSnapshot: vi.fn().mockReturnValue([]),
      completeSimple,
    } as unknown as ModelRuntime));

    await expect(runtime.run(request())).rejects.toThrow("401 invalid credential");
    expect(completeSimple).toHaveBeenCalledTimes(1);
  });

  it("bounds a provider request even when the upstream signal remains active", async () => {
    const completeSimple = vi.fn(async (_model, _context, options: { signal: AbortSignal }) => new Promise<AssistantMessage>((resolve) => {
      options.signal.addEventListener("abort", () => resolve(message("aborted", [])), { once: true });
    }));
    const runtime = new PiPipelineSpecialistRuntime(Promise.resolve({
      getModel: vi.fn().mockReturnValue({ provider: "provider", id: "model" }),
      getAvailableSnapshot: vi.fn().mockReturnValue([]),
      completeSimple,
    } as unknown as ModelRuntime), 5);

    await expect(runtime.run({ ...request(), signal: new AbortController().signal }))
      .rejects.toThrow("timed out after 5ms");
  });
});

function request() {
  return {
    profile: {
      kind: "script" as const,
      version: "1.0.0",
      systemPrompt: "system",
      skillInstructions: "skill",
      maxInputCharacters: 1_000,
      maxOutputTokens: 1_000,
      temperature: 0.2,
    },
    context: "context",
    outputContract: "contract",
    model: "provider:model",
  };
}

function message(
  stopReason: AssistantMessage["stopReason"],
  content: AssistantMessage["content"],
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "provider",
    model: "model",
    stopReason,
    errorMessage,
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    timestamp: 1,
  };
}
