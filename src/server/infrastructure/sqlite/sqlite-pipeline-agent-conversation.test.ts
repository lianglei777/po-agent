import { afterEach, describe, expect, it } from "vitest";
import { SqliteDatabase } from "./sqlite-database";
import { SqlitePipelineRepository } from "./sqlite-pipeline-repository";

describe("SqlitePipelineRepository Agent conversations", () => {
  let database: SqliteDatabase | undefined;

  afterEach(() => database?.close());

  it("persists one isolated Agent conversation per project", async () => {
    database = new SqliteDatabase(":memory:");
    const repository = new SqlitePipelineRepository(database);
    await repository.createProject(project("project-1"));
    await repository.createProject(project("project-2"));

    const first = await repository.upsertAgentConversation({
      projectId: "project-1",
      sessionId: "session-1",
      provider: "openai",
      modelId: "model-1",
      allowAgentGeneration: false,
    });
    await repository.upsertAgentConversation({
      projectId: "project-2",
      sessionId: "session-2",
      provider: null,
      modelId: null,
      allowAgentGeneration: true,
    });

    expect(await repository.getAgentConversation("project-1")).toEqual(first);
    expect(await repository.findAgentConversationBySessionId("session-2"))
      .toMatchObject({ projectId: "project-2", allowAgentGeneration: true });
    expect(await repository.updateAgentConversation("project-1", { allowAgentGeneration: true }))
      .toMatchObject({ sessionId: "session-1", allowAgentGeneration: true });
  });
});

function project(id: string) {
  return {
    id,
    rootPath: ".",
    title: id,
    originalText: "",
    artDirection: null,
    modelSettings: null,
    promptConfig: null,
    status: "draft" as const,
    coverArtifactId: null,
  };
}
