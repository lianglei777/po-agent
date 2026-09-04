import { afterEach, describe, expect, it } from "vitest";
import { SqliteDatabase } from "./sqlite-database";
import { SqlitePipelineRepository } from "./sqlite-pipeline-repository";

describe("SqlitePipelineRepository Canvas Agent plans", () => {
  let database: SqliteDatabase | undefined;
  afterEach(() => database?.close());

  it("persists a plan and its reversible action", async () => {
    database = new SqliteDatabase(":memory:");
    const repository = new SqlitePipelineRepository(database);
    await repository.createProject({ id: "project-1", rootPath: ".", title: "Project", originalText: "",
      artDirection: null, modelSettings: null, promptConfig: null, status: "draft", coverArtifactId: null });
    const plan = await repository.createCanvasAgentPlan({
      id: "plan-1", projectId: "project-1", sessionId: "session-1", turnId: "turn-1", summary: "创建剧本",
      baseRevision: 0, operations: [{ type: "node.create", tempId: "script", mediaType: "text", name: "剧本" }],
      referencedNodeVersions: {}, status: "draft", appliedRevision: null, actionId: null,
    });
    const action = await repository.createCanvasAgentAction({
      id: "action-1", projectId: "project-1", planId: plan.id, forwardMutations: [], inverseMutations: [],
      appliedRevision: 1, status: "applied",
    });
    await repository.updateCanvasAgentPlan(plan.id, { status: "applied", appliedRevision: 1, actionId: action.id });
    await repository.updateCanvasAgentAction(action.id, { status: "undone" });

    await expect(repository.getCanvasAgentPlan(plan.id)).resolves.toMatchObject({
      status: "applied", actionId: "action-1", operations: [{ tempId: "script" }],
    });
    await expect(repository.getCanvasAgentAction(action.id)).resolves.toMatchObject({ status: "undone", appliedRevision: 1 });
  });
});
