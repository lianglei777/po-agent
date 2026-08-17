import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntime } from "@/server/ports/agent-runtime";
import type { GenerationFileStore } from "@/server/ports/generation-file-store";
import type { SessionRepository } from "@/server/ports/session-repository";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { InMemoryAgentRegistry } from "@/server/infrastructure/runtime/in-memory-agent-registry";
import { AgentService } from "./agent-service";
import { GenerationAssetService } from "./content-generation/generation-asset-service";
import { GenerationRunService } from "./content-generation/generation-run-service";

describe("new Chat Session generation integration", () => {
  let database: SqliteDatabase | undefined;

  afterEach(() => database?.close());

  it("accepts an asset immediately after Agent creation without requiring a first prompt", async () => {
    database = new SqliteDatabase(":memory:");
    const repository = new SqliteGenerationRepository(database);
    const runs = new GenerationRunService(repository);
    const runtime = runtimeStub();
    const agents = new AgentService(
      {} as SessionRepository,
      new InMemoryAgentRegistry(),
      { create: vi.fn(async () => runtime) },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      undefined,
      undefined,
      {
        async registerCreatedSession(input) {
          await runs.upsertSession({
            id: input.sessionId,
            cwd: input.cwd,
            origin: "chat",
            agentSessionRef: input.sessionFile,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
          });
        },
      },
    );
    const files = {
      saveInput: vi.fn(async () => ".po-agent/generation-inputs/reference.png"),
    } as unknown as GenerationFileStore;
    const assets = new GenerationAssetService(runs, files);

    const created = await agents.create({ cwd: "C:\\workspace" });
    await expect(assets.upload({
      sessionId: created.sessionId,
      name: "reference.png",
      contentType: "image/png",
      data: new Uint8Array([1, 2, 3]),
    })).resolves.toMatchObject({
      name: "reference.png",
      ref: {
        type: "workspace-file",
        relativePath: ".po-agent/generation-inputs/reference.png",
      },
    });
    expect(files.saveInput).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "C:\\workspace",
    }));
  });
});

function runtimeStub(): AgentRuntime {
  return {
    sessionId: "new-session",
    sessionFile: "new-session.jsonl",
    isAlive: () => true,
    invalidateModelConfig: () => {},
    invalidateWebAccessConfig: () => {},
    reloadAgentSettings: async () => {},
    execute: async <T,>() => undefined as T,
    getState: async () => ({
      sessionId: "new-session",
      sessionFile: "new-session.jsonl",
      isStreaming: false,
      isCompacting: false,
      autoRetryEnabled: true,
      contextUsage: null,
      systemPrompt: "",
      thinkingLevel: "off",
    }),
    subscribe: () => () => {},
    destroy: () => {},
  };
}
