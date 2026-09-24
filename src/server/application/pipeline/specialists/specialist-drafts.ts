import type { CanvasGenerationSettingValue, CanvasMediaType } from "@/server/domain/pipeline";
import type { PipelineSpecialistKind, PipelineSpecialistWarning } from "@/server/domain/pipeline-specialist";
import { AppError } from "@/server/domain/app-error";

interface SpecialistDraftBase {
  summary: string;
  warnings: PipelineSpecialistWarning[];
}

export interface ScriptSpecialistDraft extends SpecialistDraftBase {
  kind: "script";
  format: "short-video" | "short-drama";
  title: string;
  logline: string;
  targetDurationSeconds?: number;
  episodes: Array<{
    key: string;
    title: string;
    objective: string;
    estimatedDurationSeconds: number;
    targetNodeId?: string;
    scenes: Array<{
      key: string;
      heading: string;
      location: string;
      time: string;
      purpose: string;
      content: string;
      characterNames: string[];
    }>;
  }>;
}

export interface AssetSpecialistDraft extends SpecialistDraftBase {
  kind: "asset";
  assets: Array<{
    action: "create" | "update" | "reuse";
    targetNodeId?: string;
    assetType: "character" | "scene" | "prop";
    identityKey: string;
    canonicalName: string;
    aliases: string[];
    visualDescription: string;
    continuityFacts: string[];
    sourceNodeIds: string[];
    confidence: "high" | "medium" | "low";
  }>;
  unresolvedMentions: Array<{ name: string; reason: string; sourceNodeIds: string[] }>;
}

export interface StoryboardSpecialistDraft extends SpecialistDraftBase {
  kind: "storyboard";
  episodeKey?: string;
  sourceNodeIds: string[];
  totalDurationSeconds: number;
  shots: Array<{
    targetNodeId?: string;
    shotKey: string;
    sceneKey?: string;
    order: number;
    durationSeconds: number;
    purpose: string;
    visual: string;
    subjects: Array<{ identityKey: string; action: string; expression?: string }>;
    dialogue?: { speaker: string; line: string; emotion?: string; delivery?: string };
    shotSize: string;
    cameraMovement: string;
    blocking: string;
    lighting: string;
    ambience?: string;
    sfx?: string;
    music?: string;
    transition?: string;
  }>;
}

export interface PromptSpecialistDraft extends SpecialistDraftBase {
  kind: "prompt";
  configurations: Array<{
    targetNodeId?: string;
    sourceSpecNodeId: string;
    name: string;
    mediaType: Exclude<CanvasMediaType, "text">;
    routeId: string;
    prompt: string;
    settings: Record<string, CanvasGenerationSettingValue>;
    references: Array<{
      sourceNodeId: string;
      role: "reference" | "first-frame" | "last-frame";
      order: number;
    }>;
  }>;
}

export type PipelineSpecialistDraft =
  | ScriptSpecialistDraft
  | AssetSpecialistDraft
  | StoryboardSpecialistDraft
  | PromptSpecialistDraft;

export const SPECIALIST_OUTPUT_CONTRACTS: Record<PipelineSpecialistKind, string> = {
  script: JSON.stringify({
    kind: "script", summary: "string", warnings: [], format: "short-video|short-drama", title: "string", logline: "string",
    targetDurationSeconds: "optional number", episodes: [{ key: "string", title: "string", objective: "string",
      estimatedDurationSeconds: "positive number", targetNodeId: "optional existing text node ID",
      scenes: [{ key: "string", heading: "string", location: "string", time: "string", purpose: "string", content: "string", characterNames: ["string"] }] }],
  }),
  asset: JSON.stringify({
    kind: "asset", summary: "string", warnings: [], assets: [{ action: "create|update|reuse", targetNodeId: "required for update/reuse",
      assetType: "character|scene|prop", identityKey: "stable kebab-case key", canonicalName: "string", aliases: ["string"],
      visualDescription: "string", continuityFacts: ["string"], sourceNodeIds: ["existing source node ID"], confidence: "high|medium|low" }],
    unresolvedMentions: [{ name: "string", reason: "string", sourceNodeIds: ["string"] }],
  }),
  storyboard: JSON.stringify({
    kind: "storyboard", summary: "string", warnings: [], episodeKey: "optional string", sourceNodeIds: ["existing script node ID"],
    totalDurationSeconds: "positive number", shots: [{ targetNodeId: "optional existing shot text node ID", shotKey: "string", sceneKey: "optional string",
      order: "non-negative integer", durationSeconds: "positive number", purpose: "string", visual: "string",
      subjects: [{ identityKey: "string", action: "string", expression: "optional string" }],
      dialogue: { speaker: "string", line: "string", emotion: "optional string", delivery: "optional string" },
      shotSize: "string", cameraMovement: "string", blocking: "string", lighting: "string",
      ambience: "optional string", sfx: "optional string", music: "optional string", transition: "optional string" }],
  }),
  prompt: JSON.stringify({
    kind: "prompt", summary: "string", warnings: [], configurations: [{ targetNodeId: "optional existing media node ID",
      sourceSpecNodeId: "existing asset or shot spec text node ID", name: "string", mediaType: "image|video|audio", routeId: "supplied route ID",
      prompt: "string", settings: { routeParameterKey: "schema-compatible value" },
      references: [{ sourceNodeId: "existing media node ID", role: "reference|first-frame|last-frame", order: "non-negative integer" }] }],
  }),
};

export function parseSpecialistDraft(kind: PipelineSpecialistKind, raw: string): PipelineSpecialistDraft {
  const value = parseJsonObject(raw);
  if (value.kind !== kind) invalid("Specialist returned the wrong kind");
  const summary = requiredString(value.summary, "summary", 1_000);
  const warnings = parseWarnings(value.warnings);
  if (kind === "script") return parseScript(value, summary, warnings);
  if (kind === "asset") return parseAssets(value, summary, warnings);
  if (kind === "storyboard") return parseStoryboard(value, summary, warnings);
  return parsePrompts(value, summary, warnings);
}

function parseScript(value: Record<string, unknown>, summary: string, warnings: PipelineSpecialistWarning[]): ScriptSpecialistDraft {
  if (value.format !== "short-video" && value.format !== "short-drama") invalid("Script format is invalid");
  const episodes = array(value.episodes, "episodes", 1, 20).map((item, index) => {
    const episode = record(item, `episodes[${index}]`);
    const scenes = array(episode.scenes, `episodes[${index}].scenes`, 1, 30).map((sceneValue, sceneIndex) => {
      const scene = record(sceneValue, `episodes[${index}].scenes[${sceneIndex}]`);
      return {
        key: requiredString(scene.key, "scene.key", 240), heading: requiredString(scene.heading, "scene.heading", 500),
        location: requiredString(scene.location, "scene.location", 500), time: requiredString(scene.time, "scene.time", 200),
        purpose: requiredString(scene.purpose, "scene.purpose", 2_000), content: requiredString(scene.content, "scene.content", 30_000),
        characterNames: stringArray(scene.characterNames, "scene.characterNames", 40),
      };
    });
    return {
      key: requiredString(episode.key, "episode.key", 240), title: requiredString(episode.title, "episode.title", 500),
      objective: requiredString(episode.objective, "episode.objective", 2_000),
      estimatedDurationSeconds: positiveNumber(episode.estimatedDurationSeconds, "episode.estimatedDurationSeconds", 7_200),
      targetNodeId: optionalString(episode.targetNodeId, "episode.targetNodeId", 240), scenes,
    };
  });
  return { kind: "script", summary, warnings, format: value.format,
    title: requiredString(value.title, "title", 500), logline: requiredString(value.logline, "logline", 2_000),
    targetDurationSeconds: optionalPositiveNumber(value.targetDurationSeconds, "targetDurationSeconds", 100_000), episodes };
}

function parseAssets(value: Record<string, unknown>, summary: string, warnings: PipelineSpecialistWarning[]): AssetSpecialistDraft {
  const assets = array(value.assets, "assets", 0, 20).map((item, index) => {
    const asset = record(item, `assets[${index}]`);
    if (!["create", "update", "reuse"].includes(String(asset.action))) invalid("Asset action is invalid");
    if (!["character", "scene", "prop"].includes(String(asset.assetType))) invalid("Asset type is invalid");
    if (!["high", "medium", "low"].includes(String(asset.confidence))) invalid("Asset confidence is invalid");
    const targetNodeId = optionalString(asset.targetNodeId, "asset.targetNodeId", 240);
    if (asset.action !== "create" && !targetNodeId) invalid("Asset update and reuse require targetNodeId");
    return {
      action: asset.action as "create" | "update" | "reuse", targetNodeId,
      assetType: asset.assetType as "character" | "scene" | "prop",
      identityKey: requiredString(asset.identityKey, "asset.identityKey", 240),
      canonicalName: requiredString(asset.canonicalName, "asset.canonicalName", 500),
      aliases: stringArray(asset.aliases, "asset.aliases", 40),
      visualDescription: requiredString(asset.visualDescription, "asset.visualDescription", 20_000),
      continuityFacts: stringArray(asset.continuityFacts, "asset.continuityFacts", 40),
      sourceNodeIds: stringArray(asset.sourceNodeIds, "asset.sourceNodeIds", 40),
      confidence: asset.confidence as "high" | "medium" | "low",
    };
  });
  const unresolvedMentions = array(value.unresolvedMentions ?? [], "unresolvedMentions", 0, 40).map((item, index) => {
    const mention = record(item, `unresolvedMentions[${index}]`);
    return { name: requiredString(mention.name, "mention.name", 500), reason: requiredString(mention.reason, "mention.reason", 2_000),
      sourceNodeIds: stringArray(mention.sourceNodeIds, "mention.sourceNodeIds", 40) };
  });
  return { kind: "asset", summary, warnings, assets, unresolvedMentions };
}

function parseStoryboard(value: Record<string, unknown>, summary: string, warnings: PipelineSpecialistWarning[]): StoryboardSpecialistDraft {
  const sourceNodeIds = stringArray(value.sourceNodeIds, "sourceNodeIds", 40);
  const shots = array(value.shots, "shots", 1, 20).map((item, index) => {
    const shot = record(item, `shots[${index}]`);
    const subjects = array(shot.subjects, "shot.subjects", 0, 20).map((subjectValue, subjectIndex) => {
      const subject = record(subjectValue, `shot.subjects[${subjectIndex}]`);
      return { identityKey: requiredString(subject.identityKey, "subject.identityKey", 240),
        action: requiredString(subject.action, "subject.action", 2_000), expression: optionalString(subject.expression, "subject.expression", 2_000) };
    });
    let dialogue: StoryboardSpecialistDraft["shots"][number]["dialogue"];
    if (shot.dialogue !== undefined && shot.dialogue !== null) {
      const item = record(shot.dialogue, "shot.dialogue");
      dialogue = { speaker: requiredString(item.speaker, "dialogue.speaker", 500), line: requiredString(item.line, "dialogue.line", 10_000),
        emotion: optionalString(item.emotion, "dialogue.emotion", 2_000), delivery: optionalString(item.delivery, "dialogue.delivery", 2_000) };
    }
    return {
      targetNodeId: optionalString(shot.targetNodeId, "shot.targetNodeId", 240),
      shotKey: requiredString(shot.shotKey, "shot.shotKey", 240), sceneKey: optionalString(shot.sceneKey, "shot.sceneKey", 240),
      order: nonNegativeInteger(shot.order, "shot.order"), durationSeconds: positiveNumber(shot.durationSeconds, "shot.durationSeconds", 3_600),
      purpose: requiredString(shot.purpose, "shot.purpose", 2_000), visual: requiredString(shot.visual, "shot.visual", 20_000),
      subjects, dialogue, shotSize: requiredString(shot.shotSize, "shot.shotSize", 500),
      cameraMovement: requiredString(shot.cameraMovement, "shot.cameraMovement", 2_000),
      blocking: requiredString(shot.blocking, "shot.blocking", 2_000), lighting: requiredString(shot.lighting, "shot.lighting", 2_000),
      ambience: optionalString(shot.ambience, "shot.ambience", 2_000), sfx: optionalString(shot.sfx, "shot.sfx", 2_000),
      music: optionalString(shot.music, "shot.music", 2_000), transition: optionalString(shot.transition, "shot.transition", 2_000),
    };
  });
  const shotKeys = new Set(shots.map((shot) => shot.shotKey));
  if (shotKeys.size !== shots.length) invalid("Storyboard shot keys must be unique");
  const shotOrders = new Set(shots.map((shot) => shot.order));
  if (shotOrders.size !== shots.length) invalid("Storyboard shot orders must be unique");
  shots.sort((left, right) => left.order - right.order);
  const orderGaps = shots.slice(1).filter((shot, index) => shot.order !== shots[index]!.order + 1);
  if (orderGaps.length) {
    warnings.push({
      code: "STORYBOARD_ORDER_GAP",
      message: "Storyboard contains non-consecutive shot orders; preserved because the requested range may be partial",
      nodeIds: orderGaps.flatMap((shot) => shot.targetNodeId ? [shot.targetNodeId] : []),
      blocking: false,
    });
  }
  const totalDurationSeconds = positiveNumber(value.totalDurationSeconds, "totalDurationSeconds", 100_000);
  const summedDurationSeconds = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  const durationTolerance = Math.max(1, totalDurationSeconds * 0.05);
  if (Math.abs(summedDurationSeconds - totalDurationSeconds) > durationTolerance) {
    const delta = totalDurationSeconds - summedDurationSeconds;
    const lastShot = shots.at(-1)!;
    // 总时长是模型容易出现的算术误差；小范围增量落到收尾镜头，减量则从后向前分摊并保留可执行的最短镜头。
    if (Math.abs(delta) > totalDurationSeconds * 0.2) {
      invalid(`Storyboard shot duration total ${summedDurationSeconds} does not match declared total ${totalDurationSeconds}`);
    }
    if (delta >= 0) {
      lastShot.durationSeconds += delta;
    } else {
      let remaining = -delta;
      for (const shot of [...shots].reverse()) {
        const reduction = Math.min(remaining, Math.max(0, shot.durationSeconds - 0.5));
        shot.durationSeconds -= reduction;
        remaining -= reduction;
        if (remaining <= Number.EPSILON) break;
      }
      if (remaining > Number.EPSILON) {
        invalid(`Storyboard shot duration total ${summedDurationSeconds} does not match declared total ${totalDurationSeconds}`);
      }
    }
    warnings.push({
      code: "STORYBOARD_DURATION_TOTAL_NORMALIZED",
      message: `Adjusted shot durations by ${delta} seconds so they total ${totalDurationSeconds} seconds`,
      nodeIds: [],
      blocking: false,
    });
  }
  return { kind: "storyboard", summary, warnings, episodeKey: optionalString(value.episodeKey, "episodeKey", 240), sourceNodeIds,
    totalDurationSeconds, shots };
}

function parsePrompts(value: Record<string, unknown>, summary: string, warnings: PipelineSpecialistWarning[]): PromptSpecialistDraft {
  const configurations = array(value.configurations, "configurations", 0, 20).map((item, index) => {
    const configuration = record(item, `configurations[${index}]`);
    if (!["image", "video", "audio"].includes(String(configuration.mediaType))) invalid("Prompt media type is invalid");
    const settings = record(configuration.settings ?? {}, "configuration.settings") as Record<string, CanvasGenerationSettingValue>;
    const references = array(configuration.references ?? [], "configuration.references", 0, 20).map((referenceValue, referenceIndex) => {
      const reference = record(referenceValue, `configuration.references[${referenceIndex}]`);
      if (!["reference", "first-frame", "last-frame"].includes(String(reference.role))) invalid("Prompt reference role is invalid");
      return { sourceNodeId: requiredString(reference.sourceNodeId, "reference.sourceNodeId", 240),
        role: reference.role as "reference" | "first-frame" | "last-frame", order: nonNegativeInteger(reference.order, "reference.order") };
    });
    return {
      targetNodeId: optionalString(configuration.targetNodeId, "configuration.targetNodeId", 240),
      sourceSpecNodeId: requiredString(configuration.sourceSpecNodeId, "configuration.sourceSpecNodeId", 240),
      name: requiredString(configuration.name, "configuration.name", 500),
      mediaType: configuration.mediaType as "image" | "video" | "audio",
      routeId: requiredString(configuration.routeId, "configuration.routeId", 240), prompt: requiredString(configuration.prompt, "configuration.prompt", 20_000),
      settings, references,
    };
  });
  return { kind: "prompt", summary, warnings, configurations };
}

function parseWarnings(value: unknown): PipelineSpecialistWarning[] {
  return array(value ?? [], "warnings", 0, 40).map((item, index) => {
    if (typeof item === "string") {
      return { code: "SPECIALIST_WARNING", message: requiredString(item, `warnings[${index}]`, 2_000), nodeIds: [], blocking: false };
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      const message = JSON.stringify(item);
      return { code: "SPECIALIST_WARNING", message: message.length <= 2_000 ? message : message.slice(0, 2_000), nodeIds: [], blocking: false };
    }
    const warning = item as Record<string, unknown>;
    const code = typeof warning.code === "string" && warning.code.trim() ? warning.code.trim().slice(0, 120) : "SPECIALIST_WARNING";
    const message = typeof warning.message === "string" && warning.message.trim()
      ? warning.message.trim().slice(0, 2_000)
      : JSON.stringify(warning).slice(0, 2_000);
    return { code, message, nodeIds: stringArray(warning.nodeIds ?? [], "warning.nodeIds", 40), blocking: warning.blocking === true };
  });
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) invalid("Specialist did not return a JSON object");
  try {
    return record(JSON.parse(raw.slice(first, last + 1)), "output");
  } catch {
    invalid("Specialist returned invalid JSON");
  }
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(`${field} must contain ${min} to ${max} items`);
  return value;
}

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) invalid(`${field} is invalid`);
  return value.trim();
}

function optionalString(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, max);
}

function stringArray(value: unknown, field: string, max: number): string[] {
  return array(value, field, 0, max).map((item, index) => requiredString(item, `${field}[${index}]`, 2_000));
}

function positiveNumber(value: unknown, field: string, max: number): number {
  if (!Number.isFinite(value) || Number(value) <= 0 || Number(value) > max) invalid(`${field} is invalid`);
  return Number(value);
}

function optionalPositiveNumber(value: unknown, field: string, max: number): number | undefined {
  return value === undefined || value === null ? undefined : positiveNumber(value, field, max);
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) invalid(`${field} is invalid`);
  return Number(value);
}

function invalid(message: string): never {
  throw new AppError("PIPELINE_SPECIALIST_OUTPUT_INVALID", message, 422);
}
