import { randomUUID } from "node:crypto";
import { AppError } from "@/server/domain/app-error";
import type {
  CanvasEdge,
  CanvasNodeData,
  CanvasWorkflowRun,
  CanvasWorkflowRunStep,
} from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { PipelineSsePort } from "@/server/ports/pipeline-sse-port";
import type { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import type { CanvasStudioService } from "./canvas-studio-service";

type ServiceOptions = {
  createId?: () => string;
  now?: () => Date;
};

export class CanvasWorkflowRunService {
  private readonly advancing = new Set<string>();
  private readonly requestedAdvances = new Set<string>();
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: PipelineRepository,
    private readonly generationRuns: GenerationRunService,
    private readonly canvas: CanvasStudioService,
    private readonly sse: PipelineSsePort,
    options: ServiceOptions = {},
  ) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async create(input: { projectId: string; nodeIds: string[] }): Promise<CanvasWorkflowRun> {
    if (!await this.repository.getProject(input.projectId)) {
      throw new AppError("PIPELINE_PROJECT_NOT_FOUND", "Pipeline project was not found", 404);
    }
    const active = await this.repository.listActiveCanvasWorkflowRuns(input.projectId);
    if (active.length) {
      throw new AppError("PIPELINE_WORKFLOW_RUN_ACTIVE", "A canvas workflow is already running", 409);
    }

    const requestedIds = [...new Set(input.nodeIds)];
    if (!requestedIds.length) {
      throw new AppError("VALIDATION_ERROR", "Select at least one canvas node to run", 400);
    }
    const [allNodes, allEdges] = await Promise.all([
      this.repository.listCanvasNodes(input.projectId),
      this.repository.listCanvasEdges(input.projectId),
    ]);
    const nodesById = new Map(allNodes.map((node) => [node.id, node]));
    if (requestedIds.some((nodeId) => !nodesById.has(nodeId))) {
      throw new AppError("VALIDATION_ERROR", "The workflow selection contains an unavailable canvas node", 400);
    }
    const runnable = requestedIds
      .map((nodeId) => nodesById.get(nodeId)!)
      .filter((node) => node.data && workflowNodeIsRunnable(node.data));
    if (!runnable.length) {
      throw new AppError("VALIDATION_ERROR", "The selection has no generative nodes to run", 400);
    }
    const busy = runnable.find((node) => node.data?.taskInfo?.status === "queued" || node.data?.taskInfo?.status === "processing");
    if (busy) {
      throw new AppError("VALIDATION_ERROR", `Canvas node is already generating: ${busy.data?.name ?? busy.id}`, 409);
    }

    const runnableIds = new Set(runnable.map((node) => node.id));
    const edges = internalRunEdges(allEdges, runnableIds);
    if (hasCycle(runnableIds, edges)) {
      throw new AppError("VALIDATION_ERROR", "The selected nodes contain a generation cycle", 400);
    }

    // 所有静态配置必须在首个付费 Run 创建前通过；计划内上游产物由预检占位，不会访问供应商。
    for (const node of runnable) {
      await this.canvas.preflightWorkflowNode(node.id, runnableIds);
    }

    let run: CanvasWorkflowRun;
    try {
      run = await this.repository.createCanvasWorkflowRun({
        id: this.createId(),
        projectId: input.projectId,
        nodeIds: runnable.map((node) => node.id),
        edges,
        steps: runnable.map((node) => ({ nodeId: node.id, status: "pending" })),
      });
    } catch (error) {
      // 数据库唯一约束负责封住多窗口并发；复查后把实现细节映射回稳定业务错误。
      if ((await this.repository.listActiveCanvasWorkflowRuns(input.projectId)).length) {
        throw new AppError("PIPELINE_WORKFLOW_RUN_ACTIVE", "A canvas workflow is already running", 409);
      }
      throw error;
    }
    await this.repository.updateCanvasWorkflowRun(run.id, { status: "running" });
    this.scheduleAdvance(run.id);
    return (await this.repository.getCanvasWorkflowRun(run.id))!;
  }

  async get(projectId: string, runId: string): Promise<CanvasWorkflowRun> {
    const run = await this.repository.getCanvasWorkflowRun(runId);
    if (!run || run.projectId !== projectId) {
      throw new AppError("PIPELINE_WORKFLOW_RUN_NOT_FOUND", "Canvas workflow run was not found", 404);
    }
    return run;
  }

  async list(projectId: string, limit = 20): Promise<CanvasWorkflowRun[]> {
    await this.resumeProject(projectId);
    return this.repository.listCanvasWorkflowRuns(projectId, limit);
  }

  async cancel(projectId: string, runId: string): Promise<CanvasWorkflowRun> {
    let run = await this.get(projectId, runId);
    if (run.status === "completed" || run.status === "cancelled") return run;
    if (run.status !== "pending" && run.status !== "running" && run.status !== "failed" && run.status !== "cancelling") {
      throw new AppError("PIPELINE_WORKFLOW_RUN_NOT_CANCELLABLE", "Canvas workflow run cannot be cancelled", 409);
    }
    await this.repository.updateCanvasWorkflowRun(run.id, { status: "cancelling" });
    run = (await this.repository.getCanvasWorkflowRun(run.id))!;

    await Promise.all(run.steps.map(async (step) => {
      if (step.status === "completed" || step.status === "failed" || step.status === "cancelled") return;
      if (step.generationRunId) {
        try {
          await this.canvas.cancelGeneration(step.nodeId, { workflowRunId: run.id });
        } catch {
          // 取消是尽力而为；Workflow 状态仍需收敛，供应商侧限制由现有 Generation Run 语义承担。
        }
      }
      await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
        status: "cancelled",
        completedAt: this.timestamp(),
      });
    }));

    const cancelled = await this.repository.updateCanvasWorkflowRun(run.id, {
      status: "cancelled",
      completedAt: this.timestamp(),
    });
    this.emit(cancelled!);
    return cancelled!;
  }

  async retry(projectId: string, runId: string): Promise<CanvasWorkflowRun> {
    let run = await this.get(projectId, runId);
    if (run.status !== "failed") {
      throw new AppError("PIPELINE_WORKFLOW_RUN_NOT_RETRYABLE", "Only a failed canvas workflow can be retried", 409);
    }
    if (run.steps.some((step) => step.status === "running")) {
      throw new AppError("PIPELINE_WORKFLOW_RUN_BUSY", "Wait for the remaining active steps before retrying", 409);
    }

    for (const step of run.steps.filter((candidate) => candidate.status === "failed")) {
      if (step.generationRunId) {
        const retried = await this.canvas.retryNodeGeneration(
          step.nodeId,
          step.generationRunId,
          `pipeline:workflow:${run.id}:${step.nodeId}:retry:${this.timestamp()}`,
        );
        await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
          status: "running",
          generationRunId: retried.view.run.id,
          errorMessage: null,
          startedAt: this.timestamp(),
          completedAt: null,
        });
      } else {
        await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
          status: "pending",
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        });
      }
    }
    await this.repository.updateCanvasWorkflowRun(run.id, {
      status: "running",
      errorMessage: null,
      completedAt: null,
    });
    this.scheduleAdvance(run.id);
    run = (await this.repository.getCanvasWorkflowRun(run.id))!;
    this.emit(run);
    return run;
  }

  async handleGenerationCompleted(
    projectId: string,
    nodeId: string,
    generationRunId: string,
  ): Promise<void> {
    const run = await this.repository.findCanvasWorkflowRunByGenerationRunId(projectId, generationRunId);
    if (!run) return;
    const step = run.steps.find((candidate) => candidate.nodeId === nodeId && candidate.generationRunId === generationRunId);
    if (!step || step.status !== "running") return;
    await this.repository.updateCanvasWorkflowRunStep(run.id, nodeId, {
      status: "completed",
      completedAt: this.timestamp(),
    });
    if (run.status === "running" || run.status === "pending") this.scheduleAdvance(run.id);
    const updated = await this.repository.getCanvasWorkflowRun(run.id);
    if (updated) this.emit(updated);
  }

  async handleGenerationFailed(
    projectId: string,
    nodeId: string,
    generationRunId: string,
    message: string,
  ): Promise<void> {
    const run = await this.repository.findCanvasWorkflowRunByGenerationRunId(projectId, generationRunId);
    if (!run || run.status === "completed" || run.status === "cancelled") return;
    const step = run.steps.find((candidate) => candidate.nodeId === nodeId && candidate.generationRunId === generationRunId);
    if (!step) return;
    await this.failStep(run, step, message);
  }

  async resumeProject(projectId: string): Promise<void> {
    const activeRuns = await this.repository.listActiveCanvasWorkflowRuns(projectId);
    for (const run of activeRuns) {
      if (run.status === "cancelling") {
        await this.cancel(projectId, run.id);
        continue;
      }
      let terminalFailure: string | undefined;
      for (const step of run.steps.filter((candidate) => candidate.status === "running")) {
        if (!step.generationRunId) {
          // 没有关联持久化 Run 的步骤可能在文本调用或 Run 绑定前被中断；重置后由确定性幂等键安全恢复。
          await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
            status: "pending",
            startedAt: null,
          });
          continue;
        }
        const generation = await this.generationRuns.getRun(step.generationRunId);
        if (!generation) {
          terminalFailure = "The linked generation run is no longer available";
          await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
            status: "failed",
            errorMessage: terminalFailure,
            completedAt: this.timestamp(),
          });
          continue;
        }
        if (generation.run.status === "succeeded") {
          await this.canvas.completeGeneration(step.nodeId, step.generationRunId, generation.artifacts);
          await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
            status: "completed",
            completedAt: generation.run.completedAt ?? this.timestamp(),
          });
        } else if (generation.run.status === "failed") {
          terminalFailure = generation.run.errorMessage ?? "Generation failed";
          await this.canvas.failGeneration(step.nodeId, step.generationRunId, terminalFailure);
          await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
            status: "failed",
            errorMessage: terminalFailure,
            completedAt: generation.run.completedAt ?? this.timestamp(),
          });
        } else if (generation.run.status === "cancelled") {
          terminalFailure = "The linked generation run was cancelled outside the workflow";
          await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
            status: "failed",
            errorMessage: terminalFailure,
            completedAt: generation.run.completedAt ?? this.timestamp(),
          });
        }
      }
      if (terminalFailure) {
        const failed = await this.repository.updateCanvasWorkflowRun(run.id, {
          status: "failed",
          errorMessage: terminalFailure,
        });
        if (failed) this.emit(failed);
      } else {
        this.scheduleAdvance(run.id);
      }
    }
  }

  private scheduleAdvance(runId: string): void {
    void this.advance(runId).catch(async (error) => {
      const run = await this.repository.getCanvasWorkflowRun(runId);
      if (!run || run.status === "completed" || run.status === "cancelled") return;
      const failed = await this.repository.updateCanvasWorkflowRun(runId, {
        status: "failed",
        errorMessage: errorMessage(error),
      });
      if (failed) this.emit(failed);
    });
  }

  private async advance(runId: string): Promise<void> {
    if (this.advancing.has(runId)) {
      this.requestedAdvances.add(runId);
      return;
    }
    this.advancing.add(runId);
    try {
      while (true) {
        const run = await this.repository.getCanvasWorkflowRun(runId);
        if (!run || (run.status !== "pending" && run.status !== "running")) return;
        if (run.steps.every((step) => step.status === "completed")) {
          const completed = await this.repository.updateCanvasWorkflowRun(run.id, {
            status: "completed",
            errorMessage: null,
            completedAt: this.timestamp(),
          });
          if (completed) this.emit(completed);
          return;
        }
        if (run.steps.some((step) => step.status === "failed")) {
          const failedStep = run.steps.find((step) => step.status === "failed");
          const failed = await this.repository.updateCanvasWorkflowRun(run.id, {
            status: "failed",
            errorMessage: failedStep?.errorMessage ?? "A canvas workflow step failed",
          });
          if (failed) this.emit(failed);
          return;
        }

        const stepsByNode = new Map(run.steps.map((step) => [step.nodeId, step]));
        const ready = run.steps.filter((step) => {
          if (step.status !== "pending") return false;
          return run.edges
            .filter((edge) => edge.targetNodeId === step.nodeId)
            .every((edge) => stepsByNode.get(edge.sourceNodeId)?.status === "completed");
        });
        if (!ready.length) {
          if (run.steps.some((step) => step.status === "running")) return;
          const failed = await this.repository.updateCanvasWorkflowRun(run.id, {
            status: "failed",
            errorMessage: "The canvas workflow cannot make progress",
          });
          if (failed) this.emit(failed);
          return;
        }

        const results = await Promise.allSettled(ready.map((step) => this.executeStep(run, step)));
        const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (rejected) {
          const latest = await this.repository.getCanvasWorkflowRun(run.id);
          if (latest?.status === "failed") return;
        }
      }
    } finally {
      this.advancing.delete(runId);
      if (this.requestedAdvances.delete(runId)) await this.advance(runId);
    }
  }

  private async executeStep(run: CanvasWorkflowRun, step: CanvasWorkflowRunStep): Promise<void> {
    await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
      status: "running",
      errorMessage: null,
      startedAt: this.timestamp(),
    });
    this.emit((await this.repository.getCanvasWorkflowRun(run.id))!);
    try {
      const result = await this.canvas.generate(
        step.nodeId,
        undefined,
        { idempotencyKey: `pipeline:workflow:${run.id}:${step.nodeId}` },
      );
      if (result.runId) {
        await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
          generationRunId: result.runId,
        });
        return;
      }
      await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
        status: "completed",
        completedAt: this.timestamp(),
      });
    } catch (error) {
      const latest = await this.repository.getCanvasWorkflowRun(run.id);
      const latestStep = latest?.steps.find((candidate) => candidate.nodeId === step.nodeId) ?? step;
      await this.failStep(run, latestStep, errorMessage(error));
      throw error;
    }
  }

  private async failStep(
    run: CanvasWorkflowRun,
    step: CanvasWorkflowRunStep,
    message: string,
  ): Promise<void> {
    await this.repository.updateCanvasWorkflowRunStep(run.id, step.nodeId, {
      status: "failed",
      errorMessage: message,
      completedAt: this.timestamp(),
    });
    const failed = await this.repository.updateCanvasWorkflowRun(run.id, {
      status: "failed",
      errorMessage: message,
    });
    if (failed) this.emit(failed);
  }

  private emit(run: CanvasWorkflowRun): void {
    this.sse.emit({
      type: "workflow_run_updated",
      projectId: run.projectId,
      payload: run,
    });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

function workflowNodeIsRunnable(data: CanvasNodeData): boolean {
  if (data.generatorType === "resource" || data.type === "audio") return false;
  if (data.type === "text") {
    return Boolean(data.params?.promptDocument?.plainText.trim() || data.params?.prompt.trim());
  }
  return data.type === "image" || data.type === "video";
}

function internalRunEdges(edges: CanvasEdge[], nodeIds: Set<string>): CanvasWorkflowRun["edges"] {
  return edges
    .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
    .map((edge) => ({ sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId }));
}

function hasCycle(nodeIds: Set<string>, edges: CanvasWorkflowRun["edges"]): boolean {
  const indegree = new Map([...nodeIds].map((nodeId) => [nodeId, 0]));
  const outgoing = new Map([...nodeIds].map((nodeId) => [nodeId, [] as string[]]));
  for (const edge of edges) {
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }
  const ready = [...nodeIds].filter((nodeId) => indegree.get(nodeId) === 0);
  let visited = 0;
  while (ready.length) {
    const nodeId = ready.shift()!;
    visited += 1;
    for (const target of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) ready.push(target);
    }
  }
  return visited !== nodeIds.size;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
