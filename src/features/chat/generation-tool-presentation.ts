import type { GenerationToolDetails } from "@/contracts/generation";

export function generationToolDetails(
  value: unknown,
): GenerationToolDetails | null {
  if (!value || typeof value !== "object") return null;
  const details = value as Partial<GenerationToolDetails>;
  return typeof details.runId === "string" &&
    typeof details.status === "string" &&
    Array.isArray(details.artifacts)
    ? (details as GenerationToolDetails)
    : null;
}

export function generationArtifactPath(cwd: string, localPath: string) {
  if (/^(?:[a-zA-Z]:[\\/]|\/)/.test(localPath)) return localPath;
  const separator = cwd.includes("\\") ? "\\" : "/";
  return `${cwd.replace(/[\\/]+$/, "")}${separator}${localPath.replace(/^[\\/]+/, "")}`;
}
