import { AppError } from "@/server/domain/app-error";
import type {
  CanvasAgentPlanOperation,
  CanvasAssetSpec,
  CanvasEdge,
  CanvasNode,
  CanvasScriptSpec,
  CanvasShotSpec,
} from "@/server/domain/pipeline";
import type {
  AssetSpecialistDraft,
  PipelineSpecialistDraft,
  PromptSpecialistDraft,
  ScriptSpecialistDraft,
  StoryboardSpecialistDraft,
} from "./specialist-drafts";

const MAX_SPECIALIST_OPERATIONS = 40;

export interface SpecialistCompilation {
  operations: CanvasAgentPlanOperation[];
  affectedNodeIds: string[];
}

export function compileSpecialistDraft(
  draft: PipelineSpecialistDraft,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): SpecialistCompilation {
  const result = draft.kind === "script"
    ? compileScript(draft, nodes)
    : draft.kind === "asset"
      ? compileAssets(draft, nodes, edges)
      : draft.kind === "storyboard"
        ? compileStoryboard(draft, nodes, edges)
        : compilePrompts(draft, nodes, edges);
  if (!result.operations.length) return result;
  if (result.operations.length > MAX_SPECIALIST_OPERATIONS) {
    throw new AppError("PIPELINE_SPECIALIST_BATCH_REQUIRED", "The Specialist result exceeds the safe plan size; split it by episode or scene", 409, {
      operationCount: result.operations.length,
      maxOperations: MAX_SPECIALIST_OPERATIONS,
    });
  }
  return result;
}

function compileScript(draft: ScriptSpecialistDraft, nodes: CanvasNode[]): SpecialistCompilation {
  const operations: CanvasAgentPlanOperation[] = [];
  const affected: string[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const [index, episode] of draft.episodes.entries()) {
    const content = renderScriptEpisode(draft, episode);
    const spec: CanvasScriptSpec = {
      schemaVersion: 1,
      kind: "script",
      level: draft.format === "short-drama" ? "episode" : "segment",
      key: episode.key,
      title: episode.title,
      objective: episode.objective,
      estimatedDurationSeconds: episode.estimatedDurationSeconds,
      characters: [...new Set(episode.scenes.flatMap((scene) => scene.characterNames))],
      sourceNodeIds: episode.targetNodeId ? [episode.targetNodeId] : [],
    };
    const group = draft.format === "short-drama" ? { id: groupId(episode.key), name: episode.title } : undefined;
    if (episode.targetNodeId) {
      requireTextNode(nodeById, episode.targetNodeId, "Script target");
      operations.push({ type: "node.update", nodeId: episode.targetNodeId, name: episode.title, text: content, creativeSpec: spec, group });
      affected.push(episode.targetNodeId);
    } else {
      operations.push({ type: "node.create", tempId: `script-${index + 1}`, mediaType: "text", name: episode.title,
        text: content, creativeSpec: spec, group, column: index % 4, row: Math.floor(index / 4) });
    }
  }
  return { operations, affectedNodeIds: affected };
}

function compileAssets(draft: AssetSpecialistDraft, nodes: CanvasNode[], edges: CanvasEdge[]): SpecialistCompilation {
  const operations: CanvasAgentPlanOperation[] = [];
  const affected: string[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const [index, asset] of draft.assets.entries()) {
    for (const sourceNodeId of asset.sourceNodeIds) {
      if (!nodeById.has(sourceNodeId)) invalid(`Asset source ${sourceNodeId} was not found in the current canvas`);
    }
    const matched = resolveExistingAsset(asset, nodes);
    const requestedTarget = asset.targetNodeId ? nodeById.get(asset.targetNodeId) : undefined;
    const targetHasDifferentSpec = requestedTarget?.data?.creativeSpec
      && requestedTarget.data.creativeSpec.kind !== "asset";
    // Specialist 即使误把剧本或镜头节点填为 target，也只能新建资产，不能破坏另一层的规格。
    const targetNodeId = targetHasDifferentSpec ? matched?.id : asset.targetNodeId ?? matched?.id;
    const matchedLegacyNode = matched && matched.data?.creativeSpec?.kind !== "asset";
    const matchedLockedNode = matched ? assetNodeIsLocked(matched) : false;
    const resolvedAction = targetHasDifferentSpec
      ? matched ? "reuse" : "create"
      : asset.action === "create" && matched
        ? matchedLegacyNode && !matchedLockedNode ? "update" : "reuse"
        : asset.action;
    if (resolvedAction === "reuse") {
      if (!targetNodeId) invalid(`Asset ${asset.identityKey} cannot be reused without a target node`);
      requireTextNode(nodeById, targetNodeId, "Asset target");
      affected.push(targetNodeId);
      continue;
    }
    const spec: CanvasAssetSpec = {
      schemaVersion: 1, kind: "asset", assetType: asset.assetType, identityKey: asset.identityKey,
      canonicalName: asset.canonicalName, aliases: asset.aliases, visualDescription: asset.visualDescription,
      continuityFacts: asset.continuityFacts, sourceNodeIds: asset.sourceNodeIds,
    };
    const text = renderAsset(spec);
    const handle = resolvedAction === "update" ? targetNodeId : `asset-${index + 1}`;
    if (!handle) invalid(`Asset ${asset.identityKey} update requires a target node`);
    if (resolvedAction === "update") {
      const target = requireTextNode(nodeById, handle, "Asset target");
      if (assetNodeIsLocked(target)) {
        throw new AppError("PIPELINE_ASSET_LOCKED", `Asset target ${handle} is currently locked by a generation workflow`, 409, { nodeId: handle });
      }
      operations.push({ type: "node.update", nodeId: handle, name: asset.canonicalName, text, creativeSpec: spec });
      affected.push(handle);
    } else {
      operations.push({ type: "node.create", tempId: handle, mediaType: "text", name: asset.canonicalName, text, creativeSpec: spec,
        column: index % 4, row: Math.floor(index / 4) });
    }
    addSemanticSourceEdges(operations, edges, asset.sourceNodeIds, handle, "derives_from");
  }
  return { operations, affectedNodeIds: [...new Set(affected)] };
}

function resolveExistingAsset(asset: AssetSpecialistDraft["assets"][number], nodes: CanvasNode[]): CanvasNode | undefined {
  const normalizedIdentity = normalizeAssetKey(asset.identityKey);
  const identityMatches = nodes.filter((node) => node.data?.creativeSpec?.kind === "asset"
    && normalizeAssetKey(node.data.creativeSpec.identityKey) === normalizedIdentity);
  if (identityMatches.length > 1) ambiguousAsset(asset.identityKey, identityMatches);
  if (identityMatches.length === 1) return identityMatches[0];

  const requestedNames = new Set([asset.canonicalName, ...asset.aliases].map(normalizeAssetKey).filter(Boolean));
  const nameMatches = nodes.filter((node) => {
    if (!node.data || node.data.type !== "text") return false;
    const spec = node.data.creativeSpec;
    // 已有剧本和镜头标题可能恰好等于道具名；它们不是旧资产节点，绝不能被资产升级覆盖。
    if (spec && spec.kind !== "asset") return false;
    const names = spec?.kind === "asset"
      ? [spec.canonicalName, ...spec.aliases]
      : [node.data.name, firstHeading(node.data.content?.join("\n") ?? node.data.textDocument?.plainText ?? "")];
    return names.some((name) => requestedNames.has(normalizeAssetKey(name)));
  });
  if (nameMatches.length > 1) ambiguousAsset(asset.identityKey, nameMatches);
  return nameMatches[0];
}

function ambiguousAsset(identityKey: string, matches: CanvasNode[]): never {
  throw new AppError("PIPELINE_SPECIALIST_IDENTITY_AMBIGUOUS", `Asset ${identityKey} matches multiple existing nodes`, 409, {
    identityKey,
    candidateNodeIds: matches.map((node) => node.id),
  });
}

function normalizeAssetKey(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase()
    .replace(/^(资产|角色|场景|道具|asset|character|scene|prop)[·:：\s_-]+/i, "")
    .replace(/[\s·:：_\-—，,。.!！?？'"“”‘’]/g, "");
}

function firstHeading(value: string): string {
  return value.split("\n").map((line) => line.trim()).find((line) => /^#\s*/.test(line))?.replace(/^#+\s*/, "") ?? "";
}

function assetNodeIsLocked(node: CanvasNode): boolean {
  return node.data?.taskInfo?.status === "processing" || node.data?.taskInfo?.status === "queued"
    || node.data?.groupRun?.status === "pending" || node.data?.groupRun?.status === "running";
}

function compileStoryboard(draft: StoryboardSpecialistDraft, nodes: CanvasNode[], edges: CanvasEdge[]): SpecialistCompilation {
  const operations: CanvasAgentPlanOperation[] = [];
  const affected: string[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const group = draft.episodeKey ? { id: groupId(draft.episodeKey), name: draft.episodeKey } : undefined;
  const scriptSourceNodeIds = draft.sourceNodeIds.filter((nodeId) => nodeById.get(nodeId)?.data?.creativeSpec?.kind === "script");
  for (const [index, shot] of [...draft.shots].sort((left, right) => left.order - right.order).entries()) {
    const spec: CanvasShotSpec = {
      schemaVersion: 1, kind: "shot", shotKey: shot.shotKey, episodeKey: draft.episodeKey, sceneKey: shot.sceneKey,
      order: shot.order, durationSeconds: shot.durationSeconds, purpose: shot.purpose, visual: shot.visual,
      subjects: shot.subjects, dialogue: shot.dialogue, shotSize: shot.shotSize, cameraMovement: shot.cameraMovement,
      blocking: shot.blocking, lighting: shot.lighting,
      audio: { ambience: shot.ambience, sfx: shot.sfx, music: shot.music }, transition: shot.transition,
      sourceNodeIds: draft.sourceNodeIds,
    };
    const text = renderShot(spec);
    const handle = shot.targetNodeId ?? `shot-${index + 1}`;
    const name = `镜头 ${String(shot.order + 1).padStart(2, "0")} · ${shot.purpose}`;
    if (shot.targetNodeId) {
      requireTextNode(nodeById, shot.targetNodeId, "Storyboard target");
      operations.push({ type: "node.update", nodeId: shot.targetNodeId, name, text, creativeSpec: spec, group });
      affected.push(shot.targetNodeId);
    } else {
      operations.push({ type: "node.create", tempId: handle, mediaType: "text", name, text, creativeSpec: spec, group,
        column: index % 5, row: Math.floor(index / 5) });
    }
    // 资产身份已在 subjects 中稳定引用；每个镜头只保留剧本血缘，避免节点数乘资产数造成 Plan 爆炸。
    addSemanticSourceEdges(operations, edges, scriptSourceNodeIds, handle, "derives_from");
  }
  return { operations, affectedNodeIds: affected };
}

function compilePrompts(draft: PromptSpecialistDraft, nodes: CanvasNode[], edges: CanvasEdge[]): SpecialistCompilation {
  const operations: CanvasAgentPlanOperation[] = [];
  const affected: string[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const [index, configuration] of draft.configurations.entries()) {
    const sourceSpec = requireTextNode(nodeById, configuration.sourceSpecNodeId, "Prompt source spec");
    if (!sourceSpec.data?.creativeSpec) invalid(`Prompt source ${configuration.sourceSpecNodeId} has no creative spec`);
    const reusableTarget = configuration.targetNodeId
      ? nodeById.get(configuration.targetNodeId)
      : reusablePromptTarget(configuration, nodes, edges);
    const handle = reusableTarget?.id ?? `media-${index + 1}`;
    if (reusableTarget) {
      if (!reusableTarget.data || reusableTarget.data.type !== configuration.mediaType) invalid(`Prompt target ${reusableTarget.id} has the wrong media type`);
      operations.push({ type: "node.update", nodeId: reusableTarget.id, name: configuration.name,
        prompt: configuration.prompt, routeId: configuration.routeId, settings: configuration.settings });
      affected.push(reusableTarget.id);
    } else {
      operations.push({ type: "node.create", tempId: handle, mediaType: configuration.mediaType, name: configuration.name,
        prompt: configuration.prompt, routeId: configuration.routeId, settings: configuration.settings,
        group: sourceSpec.data.group, column: index % 5, row: Math.floor(index / 5) });
    }
    addEdgeIfMissing(operations, edges, configuration.sourceSpecNodeId, handle, "derives_from");
    for (const reference of [...configuration.references].sort((left, right) => left.order - right.order)) {
      const referenceNode = nodeById.get(reference.sourceNodeId);
      if (!referenceNode?.data || referenceNode.data.type === "text") invalid(`Prompt reference ${reference.sourceNodeId} is not a media node`);
      addEdgeIfMissing(operations, edges, reference.sourceNodeId, handle, "references", reference.role);
    }
  }
  return { operations, affectedNodeIds: affected };
}

function reusablePromptTarget(
  configuration: PromptSpecialistDraft["configurations"][number],
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasNode | undefined {
  const derivedIds = new Set(edges.filter((edge) => edge.sourceNodeId === configuration.sourceSpecNodeId
    && edge.edgeType === "derives_from").map((edge) => edge.targetNodeId));
  const candidates = nodes.filter((node) => derivedIds.has(node.id) && node.data?.type === configuration.mediaType);
  const exactName = candidates.filter((node) => normalizeAssetKey(node.data?.name ?? "") === normalizeAssetKey(configuration.name));
  if (exactName.length === 1) return exactName[0];
  return candidates.length === 1 ? candidates[0] : undefined;
}

function addSemanticSourceEdges(
  operations: CanvasAgentPlanOperation[],
  edges: CanvasEdge[],
  sourceNodeIds: string[],
  target: string,
  edgeType: "source_of" | "derives_from" | "generates",
) {
  for (const source of sourceNodeIds) {
    if (source === target) continue;
    addEdgeIfMissing(operations, edges, source, target, edgeType);
  }
}

function addEdgeIfMissing(
  operations: CanvasAgentPlanOperation[],
  edges: CanvasEdge[],
  source: string,
  target: string,
  edgeType: CanvasEdge["edgeType"],
  role?: CanvasEdge["role"],
) {
  const exists = edges.some((edge) => edge.sourceNodeId === source && edge.targetNodeId === target
    && edge.edgeType === edgeType && (edge.role ?? "reference") === (role ?? "reference"));
  const pending = operations.some((operation) => operation.type === "edge.create" && operation.source === source
    && operation.target === target && (operation.edgeType ?? "references") === edgeType && (operation.role ?? "reference") === (role ?? "reference"));
  if (!exists && !pending) operations.push({ type: "edge.create", source, target, edgeType, ...(role ? { role } : {}) });
}

function requireTextNode(nodeById: Map<string, CanvasNode>, nodeId: string, label: string): CanvasNode {
  const node = nodeById.get(nodeId);
  if (!node?.data || node.data.type !== "text") invalid(`${label} ${nodeId} is not an editable text node`);
  return node;
}

function renderScriptEpisode(draft: ScriptSpecialistDraft, episode: ScriptSpecialistDraft["episodes"][number]): string {
  const scenes = episode.scenes.map((scene) => [
    `## ${scene.heading}`,
    `地点：${scene.location} · 时间：${scene.time}`,
    `场次目的：${scene.purpose}`,
    scene.content,
  ].join("\n")).join("\n\n");
  return [`# ${episode.title}`, `一句话故事：${draft.logline}`, `本集目标：${episode.objective}`,
    `预计时长：${episode.estimatedDurationSeconds} 秒`, scenes].join("\n\n");
}

function renderAsset(spec: CanvasAssetSpec): string {
  return [
    `# ${spec.canonicalName}`,
    `类型：${assetTypeLabel(spec.assetType)}`,
    `身份标识：${spec.identityKey}`,
    spec.aliases.length ? `别名：${spec.aliases.join("、")}` : "",
    `视觉设定：${spec.visualDescription}`,
    spec.continuityFacts.length ? `连续性：\n${spec.continuityFacts.map((fact) => `- ${fact}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

function renderShot(spec: CanvasShotSpec): string {
  return [
    `# ${spec.shotKey}`,
    `时长：${spec.durationSeconds} 秒 · 景别：${spec.shotSize}`,
    `镜头目的：${spec.purpose}`,
    `画面：${spec.visual}`,
    spec.subjects.length ? `主体：\n${spec.subjects.map((subject) => `- ${subject.identityKey}：${subject.action}${subject.expression ? `；${subject.expression}` : ""}`).join("\n")}` : "",
    spec.dialogue ? `对白：${spec.dialogue.speaker}「${spec.dialogue.line}」${spec.dialogue.emotion ? `（${spec.dialogue.emotion}）` : ""}` : "",
    `运镜：${spec.cameraMovement}`,
    `走位：${spec.blocking}`,
    `灯光：${spec.lighting}`,
    [spec.audio.ambience && `环境声：${spec.audio.ambience}`, spec.audio.sfx && `音效：${spec.audio.sfx}`, spec.audio.music && `音乐：${spec.audio.music}`]
      .filter(Boolean).join(" · "),
    spec.transition ? `转场：${spec.transition}` : "",
  ].filter(Boolean).join("\n\n");
}

function groupId(value: string): string {
  return `episode:${value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "default"}`;
}

function assetTypeLabel(type: CanvasAssetSpec["assetType"]): string {
  return type === "character" ? "角色" : type === "scene" ? "场景" : "道具";
}

function invalid(message: string): never {
  throw new AppError("PIPELINE_SPECIALIST_OUTPUT_INVALID", message, 422);
}
