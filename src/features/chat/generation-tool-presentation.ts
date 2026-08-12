import type {
  GenerationRunViewDto,
  GenerationToolDetails,
} from "@/contracts/generation";

export function generationToolDetails(
  value: unknown,
): GenerationToolDetails | null {
  if (!value || typeof value !== "object") return null;
  const details = value as Partial<GenerationToolDetails>;
  return typeof details.runId === "string" &&
    typeof details.status === "string" &&
    Array.isArray(details.artifacts)
    ? ({
        ...details,
        phase: details.phase ?? phaseFromStatus(details.status),
      } as GenerationToolDetails)
    : null;
}

function phaseFromStatus(status: GenerationToolDetails["status"]): GenerationToolDetails["phase"] {
  if (status === "awaiting_confirmation") return "awaiting_confirmation";
  if (status === "succeeded") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return status === "running" ? "generating" : "queued";
}

export function generationArtifactPath(cwd: string, localPath: string) {
  if (/^(?:[a-zA-Z]:[\\/]|\/)/.test(localPath)) return localPath;
  const separator = cwd.includes("\\") ? "\\" : "/";
  return `${cwd.replace(/[\\/]+$/, "")}${separator}${localPath.replace(/^[\\/]+/, "")}`;
}

export function generationDetailsWithView(
  details: GenerationToolDetails,
  view?: GenerationRunViewDto,
): GenerationToolDetails {
  if (!view) return details;
  const job = view.jobs.at(-1);
  return {
    ...details,
    providerId: job?.providerId ?? details.providerId,
    providerTaskId: job?.remoteTaskId ?? details.providerTaskId,
    status: view.run.status,
    phase: phaseFromView(view),
    updatedAt: view.run.updatedAt,
    completedAt: view.run.completedAt,
    artifacts: view.artifacts,
    // 确认配置只属于待确认阶段；完成后必须让产物进入普通对话媒体展示链路。
    review: view.run.status === "awaiting_confirmation" ? details.review : undefined,
    error: view.run.errorCode || view.run.errorMessage
      ? {
          code: view.run.errorCode ?? "GENERATION_FAILED",
          message: view.run.errorMessage ?? "Generation failed",
        }
      : undefined,
  };
}

function phaseFromView(
  view: GenerationRunViewDto,
): GenerationToolDetails["phase"] {
  if (view.run.status === "awaiting_confirmation") return "awaiting_confirmation";
  if (view.run.status === "succeeded") return "completed";
  if (view.run.status === "failed") return "failed";
  if (view.run.status === "cancelled") return "cancelled";
  switch (view.jobs.at(-1)?.status) {
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
