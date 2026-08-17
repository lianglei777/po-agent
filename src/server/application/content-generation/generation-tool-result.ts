import type {
  GenerationArtifactDto,
  GenerationRouteDto,
  GenerationToolDetails,
} from "@/contracts/generation";
import type { AgentToolResult } from "@/server/ports/agent-tool";
import type { GenerationRunView } from "./generation-run-service";

/** 将持久化 Run 映射为 Agent 工具协议，供真实工具调用和 Chat 编排共同复用。 */
export function generationToolResult(
  view: GenerationRunView,
  options: {
    waitTimedOut?: boolean;
    route?: GenerationRouteDto;
  } = {},
): AgentToolResult<GenerationToolDetails> {
  const providerJob = view.jobs.at(-1);
  const details: GenerationToolDetails = {
    runId: view.run.id,
    routeId: view.run.routeId,
    providerId: providerJob?.providerId,
    providerOperation: providerJob?.providerOperation,
    providerTaskId: providerJob?.remoteTaskId,
    status: view.run.status,
    phase: generationPhase(view),
    createdAt: view.run.createdAt,
    updatedAt: view.run.updatedAt,
    completedAt: view.run.completedAt,
    waitTimedOut: options.waitTimedOut || undefined,
    input: view.run.input,
    requestSnapshot: providerJob?.requestSnapshot,
    responseSnapshot: providerJob?.responseSnapshot,
    artifacts: view.artifacts.map((artifact): GenerationArtifactDto => ({
      ...artifact,
    })),
    ...(view.run.status === "awaiting_confirmation" && options.route
      ? { review: { route: options.route, input: view.run.input } }
      : {}),
    ...(view.run.errorCode || view.run.errorMessage
      ? {
          error: {
            code: view.run.errorCode ?? "GENERATION_FAILED",
            message: view.run.errorMessage ?? "Generation failed",
          },
        }
      : {}),
  };
  const suffix = details.artifacts.length
    ? ` with ${details.artifacts.length} artifact(s)`
    : "";
  const providerTask = details.providerTaskId
    ? `; ${details.providerId === "runninghub" ? "RunningHub" : "provider"} task ID: ${details.providerTaskId}`
    : "";
  return {
    content: [{
      type: "text",
      text: `Local generation run ID: ${details.runId}${providerTask}; status: ${details.status}${suffix}.`,
    }],
    details,
  };
}

export function generationPhase(view: GenerationRunView): GenerationToolDetails["phase"] {
  if (view.run.status === "awaiting_confirmation") return "awaiting_confirmation";
  if (view.run.status === "succeeded") return "completed";
  if (view.run.status === "failed") return "failed";
  if (view.run.status === "cancelled") return "cancelled";
  const job = view.jobs.at(-1);
  switch (job?.status) {
    case "uploading":
      return "preparing";
    case "submitting":
      return "submitting";
    case "submitted":
    case "polling":
      return "generating";
    case "downloading":
      return "downloading";
    default:
      return "queued";
  }
}
