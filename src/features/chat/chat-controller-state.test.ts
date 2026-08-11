import { describe, expect, it } from "vitest";
import {
  canAttachImagesToModel,
  resolveLoadedModelState,
  resolveThinkingLevelForMode,
  thinkingModeFromLevel,
  resolveSubmitTarget,
} from "./chat-controller-state";
import type { ModelInfo } from "./agent-types";

const models = [
  { provider: "openai", id: "gpt-5", name: "GPT-5", thinkingLevels: [] },
  { provider: "anthropic", id: "claude", name: "Claude", thinkingLevels: [] },
] satisfies ModelInfo[];

describe("resolveLoadedModelState", () => {
  it("uses the default model when no model is selected", () => {
    expect(
      resolveLoadedModelState("", {
        models,
        defaultModel: { provider: "anthropic", modelId: "claude" },
      }),
    ).toEqual({
      models,
      modelKey: "anthropic:claude",
    });
  });

  it("keeps the selected model when the model list reloads", () => {
    expect(
      resolveLoadedModelState("openai:gpt-5", {
        models,
        defaultModel: { provider: "anthropic", modelId: "claude" },
      }).modelKey,
    ).toBe("openai:gpt-5");
  });
});
describe("resolveSubmitTarget", () => {
  it("blocks prompt submission before optimistic UI when no session or cwd exists", () => {
    expect(
      resolveSubmitTarget({
        isNew: false,
        mode: "prompt",
        newSessionCwd: null,
        sessionId: null,
      }),
    ).toEqual({ type: "blocked", reason: "NO_SESSION_TARGET" });
  });

  it("targets a new agent when a draft session has a cwd", () => {
    expect(
      resolveSubmitTarget({
        isNew: true,
        mode: "prompt",
        newSessionCwd: "C:\\work",
        sessionId: null,
      }),
    ).toEqual({ type: "new", cwd: "C:\\work" });
  });

  it("targets an existing session for follow-up commands", () => {
    expect(
      resolveSubmitTarget({
        isNew: false,
        mode: "steer",
        newSessionCwd: null,
        sessionId: "session-1",
      }),
    ).toEqual({ type: "existing", sessionId: "session-1" });
  });
});
describe("thinking mode mapping", () => {
  it("maps On to high when the model supports it", () => {
    expect(
      resolveThinkingLevelForMode(["auto", "off", "low", "medium", "high"], "on"),
    ).toBe("high");
  });

  it("uses the configured Thinking On default when supported", () => {
    expect(
      resolveThinkingLevelForMode(
        ["auto", "off", "low", "medium", "high"],
        "on",
        "medium",
      ),
    ).toBe("medium");
  });

  it("does not treat auto or off as enabling thinking", () => {
    expect(resolveThinkingLevelForMode(["auto", "off"], "on")).toBeNull();
  });

  it("keeps Auto and Off as explicit modes", () => {
    expect(resolveThinkingLevelForMode(["off", "medium"], "auto")).toBe("auto");
    expect(resolveThinkingLevelForMode(["off", "medium"], "off")).toBe("off");
  });

  it("derives the user-facing mode from the concrete level", () => {
    expect(thinkingModeFromLevel("auto")).toBe("auto");
    expect(thinkingModeFromLevel("off")).toBe("off");
    expect(thinkingModeFromLevel("high")).toBe("on");
  });
});

describe("image input support", () => {
  it("allows attachments only for models that declare image input", () => {
    expect(
      canAttachImagesToModel({
        provider: "openai",
        id: "vision",
        name: "Vision",
        thinkingLevels: [],
        input: ["text", "image"],
      }),
    ).toBe(true);
    expect(
      canAttachImagesToModel({
        provider: "openai",
        id: "text",
        name: "Text",
        thinkingLevels: [],
        input: ["text"],
      }),
    ).toBe(false);
    expect(canAttachImagesToModel(undefined)).toBe(false);
  });
});
