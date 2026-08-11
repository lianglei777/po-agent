import type { ModelInfo, ThinkingLevel } from "./agent-types";

export type LoadedModelData = {
  models: ModelInfo[];
  defaultModel: { provider: string; modelId: string } | null;
};

export function resolveLoadedModelState(
  currentModelKey: string,
  data: LoadedModelData,
) {
  return {
    models: data.models,
    modelKey: currentModelKey || defaultModelKey(data),
  };
}

export type SubmitMode = "prompt" | "steer" | "follow_up";

export type SubmitTarget =
  | { type: "new"; cwd: string }
  | { type: "existing"; sessionId: string }
  | { type: "blocked"; reason: "NO_SESSION_TARGET" };

export function resolveSubmitTarget({
  isNew,
  mode,
  newSessionCwd,
  sessionId,
}: {
  isNew: boolean;
  mode: SubmitMode;
  newSessionCwd: string | null;
  sessionId: string | null;
}): SubmitTarget {
  if (isNew && mode === "prompt" && newSessionCwd) {
    return { type: "new", cwd: newSessionCwd };
  }
  if (sessionId) return { type: "existing", sessionId };
  return { type: "blocked", reason: "NO_SESSION_TARGET" };
}

export type ThinkingMode = "auto" | "off" | "on";

const THINKING_ON_PREFERENCE: ThinkingLevel[] = [
  "high",
  "medium",
  "low",
  "minimal",
  "xhigh",
];

export function thinkingModeFromLevel(level: ThinkingLevel): ThinkingMode {
  if (level === "auto" || level === "off") return level;
  return "on";
}

export function resolveThinkingLevelForMode(
  levels: ThinkingLevel[],
  mode: ThinkingMode,
  preferredOnLevel?: ThinkingLevel,
): ThinkingLevel | null {
  if (mode === "auto") return "auto";
  if (mode === "off") return "off";
  const supported = new Set(levels);
  if (preferredOnLevel && supported.has(preferredOnLevel)) {
    return preferredOnLevel;
  }
  return (
    THINKING_ON_PREFERENCE.find((level) => supported.has(level)) ??
    levels.find((level) => level !== "auto" && level !== "off") ??
    null
  );
}

export function canAttachImagesToModel(model?: ModelInfo) {
  return model?.input?.includes("image") ?? false;
}

function defaultModelKey(data: LoadedModelData) {
  if (data.defaultModel) {
    return `${data.defaultModel.provider}:${data.defaultModel.modelId}`;
  }
  const first = data.models[0];
  return first ? `${first.provider}:${first.id}` : "";
}
