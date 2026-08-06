import { describe, expect, it, vi } from "vitest";
import { validateToolArguments } from "@earendil-works/pi-ai";

const sdk = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  createSessionManager: vi.fn(),
}));
const resources = vi.hoisted(() => ({
  createPiResourceLoader: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: sdk.createAgentSession,
  findCutPoint: vi.fn(),
  SessionManager: {
    create: sdk.createSessionManager,
    open: vi.fn(),
  },
}));
vi.mock("./pi-resource-loader", () => ({
  createPiResourceLoader: resources.createPiResourceLoader,
}));

import { PiAgentRuntimeFactory } from "./pi-agent-runtime";

describe("PiAgentRuntimeFactory", () => {
  it("enables the full built-in tool set by default", async () => {
    sdk.createSessionManager.mockReturnValue({});
    sdk.createAgentSession.mockResolvedValue({ session: {} });
    const resourceLoader = { reload: vi.fn() };
    resources.createPiResourceLoader.mockResolvedValue(resourceLoader);

    await new PiAgentRuntimeFactory().create({ cwd: "C:\\workspace" });

    expect(resources.createPiResourceLoader).toHaveBeenCalledWith({
      cwd: "C:\\workspace",
    });
    expect(sdk.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceLoader,
        tools: ["bash", "read", "edit", "write", "grep", "find", "ls"],
      }),
    );
  });

  it("adapts project tools and keeps them active beside selected built-ins", async () => {
    sdk.createSessionManager.mockReturnValue({});
    sdk.createAgentSession.mockResolvedValue({ session: {} });
    resources.createPiResourceLoader.mockResolvedValue({});
    const execute = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "queued" }],
      details: { runId: "run-1" },
    }));

    await new PiAgentRuntimeFactory().create({
      cwd: "C:\\workspace",
      toolNames: ["read"],
      customTools: [{
        name: "generate_image",
        label: "Generate image",
        description: "Generate an image",
        parameters: {
          type: "object",
          properties: { prompt: { type: "string" } },
          required: ["prompt"],
        },
        execute,
      }],
    });

    const options = sdk.createAgentSession.mock.calls.at(-1)?.[0];
    expect(options.tools).toEqual(["read", "generate_image"]);
    expect(options.customTools).toHaveLength(1);
    const onUpdate = vi.fn();
    await expect(options.customTools[0].execute(
      "call-1",
      { prompt: "lake" },
      undefined,
      onUpdate,
      {},
    )).resolves.toMatchObject({ details: { runId: "run-1" } });
    expect(execute).toHaveBeenCalledWith({
      toolCallId: "call-1",
      input: { prompt: "lake" },
      signal: undefined,
      onUpdate,
    });
    expect(() => validateToolArguments(options.customTools[0], {
      type: "toolCall",
      id: "invalid-call",
      name: "generate_image",
      arguments: {},
    })).toThrow(/prompt/);
    expect(validateToolArguments(options.customTools[0], {
      type: "toolCall",
      id: "valid-call",
      name: "generate_image",
      arguments: { prompt: "lake" },
    })).toEqual({ prompt: "lake" });
  });
});
