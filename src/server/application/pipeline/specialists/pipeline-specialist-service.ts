import { AppError } from "@/server/domain/app-error";
import type { CanvasCreativeSpec, CanvasGenerationSettingValue, CanvasNode } from "@/server/domain/pipeline";
import type { PipelineSpecialistKind, PipelineSpecialistPlanResult, PipelineSpecialistRequest, PipelineSpecialistRouteContext } from "@/server/domain/pipeline-specialist";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { PipelineSpecialistProfileSource } from "@/server/ports/pipeline-specialist-profile-source";
import type { PipelineSpecialistRuntime } from "@/server/ports/pipeline-specialist-runtime";
import type { PipelineSpecialistMetrics } from "@/server/ports/pipeline-specialist-metrics";
import type { CanvasAgentPlanService } from "../canvas-agent-plan-service";
import type { CanvasStudioService } from "../canvas-studio-service";
import { PipelineSpecialistContextAssembler } from "./pipeline-specialist-context-assembler";
import { compileSpecialistDraft } from "./specialist-compilers";
import { parseSpecialistDraft, SPECIALIST_OUTPUT_CONTRACTS, type AssetSpecialistDraft, type PipelineSpecialistDraft, type PromptSpecialistDraft, type ScriptSpecialistDraft, type StoryboardSpecialistDraft } from "./specialist-drafts";

export class PipelineSpecialistService {
  constructor(
    private readonly repository: PipelineRepository,
    private readonly profiles: PipelineSpecialistProfileSource,
    private readonly runtime: PipelineSpecialistRuntime,
    private readonly contextAssembler: PipelineSpecialistContextAssembler,
    private readonly plans: CanvasAgentPlanService,
    private readonly canvas: CanvasStudioService,
    private readonly metrics?: PipelineSpecialistMetrics,
  ) {}

  async run(kind: PipelineSpecialistKind, input: PipelineSpecialistRequest, signal?: AbortSignal): Promise<PipelineSpecialistPlanResult> {
    const startedAt = Date.now();
    try {
      const execution = await this.runInternal(kind, input, signal);
      await this.metrics?.record({
        event: "specialist-run", projectId: input.projectId, specialist: kind,
        profileVersion: execution.result.profileVersion,
        outcome: execution.result.status === "no-change" ? "no-change" : "success",
        durationMs: Date.now() - startedAt, operationCount: execution.result.operationCount,
        repairUsed: execution.repairUsed,
      }).catch(() => undefined);
      return execution.result;
    } catch (cause) {
      await this.metrics?.record({
        event: "specialist-run", projectId: input.projectId, specialist: kind, outcome: "failure",
        durationMs: Date.now() - startedAt,
        errorCode: cause instanceof AppError ? cause.code : "INTERNAL_ERROR",
      }).catch(() => undefined);
      throw cause;
    }
  }

  private async runInternal(kind: PipelineSpecialistKind, input: PipelineSpecialistRequest, signal?: AbortSignal): Promise<{
    result: PipelineSpecialistPlanResult;
    repairUsed: boolean;
  }> {
    validateRequest(input);
    const profile = await this.profiles.get(kind);
    const routes = kind === "prompt" ? await this.routeContext(input.objective) : [];
    const context = await this.contextAssembler.assemble(input, profile, routes);
    const conversation = await this.repository.getAgentConversation(input.projectId);
    if (!conversation || conversation.sessionId !== input.sessionId) {
      throw new AppError("PIPELINE_AGENT_ACTION_NOT_ALLOWED", "The Specialist session is not bound to this Pipeline project", 403);
    }
    const model = conversation.provider && conversation.modelId
      ? `${conversation.provider}:${conversation.modelId}`
      : undefined;
    let draft: PipelineSpecialistDraft;
    let repairUsed = false;
    let fallbackUsed = false;
    try {
      const raw = await this.runtime.run({
        profile, context, outputContract: SPECIALIST_OUTPUT_CONTRACTS[kind], model, signal,
      });
      try {
        draft = parseSpecialistDraft(kind, raw);
      } catch (cause) {
        if (!(cause instanceof AppError) || cause.code !== "PIPELINE_SPECIALIST_OUTPUT_INVALID") throw cause;
        repairUsed = true;
        const repaired = await this.runtime.run({
          profile, context, outputContract: SPECIALIST_OUTPUT_CONTRACTS[kind], model,
          repairResponse: raw, signal,
        });
        draft = parseSpecialistDraft(kind, repaired);
      }
    } catch (cause) {
      if (signal?.aborted) throw cause;
      fallbackUsed = true;
      if (kind === "prompt") draft = promptFallbackDraft(input.sourceNodeIds);
      else if (kind === "script") draft = scriptFallbackDraft(input);
      else if (kind === "asset") draft = assetFallbackDraft(input);
      else draft = storyboardFallbackDraft(input);
    }
    const [nodes, edges] = await Promise.all([
      this.repository.listCanvasNodes(input.projectId),
      this.repository.listCanvasEdges(input.projectId),
    ]);
    const scopedDraft = constrainDraftToRequestedTargets(draft, input.targetNodeIds);
    const normalizedDraft = scopedDraft.kind === "prompt"
      ? normalizePromptRoutes(ensurePromptConfigurations(scopedDraft, input, routes, nodes), routes, nodes)
      : scopedDraft.kind === "asset" && !scopedDraft.assets.length
        ? { ...assetFallbackDraft(input), warnings: [...scopedDraft.warnings, ...assetFallbackDraft(input).warnings], unresolvedMentions: scopedDraft.unresolvedMentions }
        : scopedDraft;
    const compilation = compileSpecialistDraft(normalizedDraft, nodes, edges);
    const warnings = [...normalizedDraft.warnings];
    if (normalizedDraft.kind === "asset") {
      warnings.push(...normalizedDraft.unresolvedMentions.map((mention) => ({
        code: "ASSET_IDENTITY_UNRESOLVED",
        message: `${mention.name}: ${mention.reason}`,
        nodeIds: mention.sourceNodeIds,
        // 未出镜或信息不足的提及保持显式警告，但不应阻塞其它确定资产进入画布。
        blocking: false,
      })));
    }
    if (normalizedDraft.kind === "storyboard") {
      const knownAssetIdentities = new Set(nodes.flatMap((node) => node.data?.creativeSpec?.kind === "asset"
        ? [node.data.creativeSpec.identityKey]
        : []));
      const unknownIdentities = [...new Set(normalizedDraft.shots.flatMap((shot) => shot.subjects.map((subject) => subject.identityKey)))]
        .filter((identityKey) => !knownAssetIdentities.has(identityKey));
      if (unknownIdentities.length) {
        warnings.push({
          code: "STORYBOARD_ASSET_IDENTITY_UNKNOWN",
          message: `Storyboard references asset identities not present on the canvas: ${unknownIdentities.join(", ")}`,
          nodeIds: normalizedDraft.sourceNodeIds,
          blocking: false,
        });
      }
      for (const shot of normalizedDraft.shots) {
        if (shot.dialogue && [...shot.dialogue.line].length / shot.durationSeconds > 8) {
          warnings.push({
            code: "STORYBOARD_DIALOGUE_TOO_DENSE",
            message: `${shot.shotKey} contains more dialogue than its duration can comfortably express`,
            nodeIds: shot.targetNodeId ? [shot.targetNodeId] : [],
            blocking: false,
          });
        }
      }
    }
    if (warnings.some((warning) => warning.blocking) || !compilation.operations.length) {
      return { result: {
        kind, profileVersion: profile.version, executionMode: fallbackUsed ? "fallback" : repairUsed ? "repaired" : "model",
        planId: null, status: "no-change", summary: normalizedDraft.summary,
        operationCount: 0, affectedNodeIds: compilation.affectedNodeIds, warnings,
      }, repairUsed };
    }
    const plan = await this.plans.create({
      projectId: input.projectId,
      sessionId: input.sessionId,
      summary: draft.summary,
      operations: compilation.operations,
    });
    return { result: {
      kind, profileVersion: profile.version, executionMode: fallbackUsed ? "fallback" : repairUsed ? "repaired" : "model",
      planId: plan.id, status: "draft", summary: plan.summary,
      operationCount: plan.operations.length, affectedNodeIds: compilation.affectedNodeIds, warnings,
    }, repairUsed };
  }

  private async routeContext(objective: string): Promise<PipelineSpecialistRouteContext[]> {
    const available = await this.canvas.listAvailableGenerationRoutes();
    const explicitlyRequested = available.filter((route) => objective.includes(route.id));
    // 未点名 Route 时优先注入无需素材的基础 Route，确保空项目能从文生图/文生视频起步；
    // 同时限制目录规模，避免与镜头规格共同挤占 Specialist 上下文预算。
    const ranked = [...available].sort((left, right) => routeCatalogPriority(left) - routeCatalogPriority(right));
    const anchors = ["text-to-image", "text-to-video", "video-to-audio"]
      .flatMap((capability) => ranked.find((route) => route.capability === capability) ?? []);
    const routes = explicitlyRequested.length ? explicitlyRequested : [...new Map(
      [...anchors, ...ranked].map((route) => [route.id, route]),
    ).values()].slice(0, 12);
    return routes.map((route) => ({
      id: route.id,
      name: route.name,
      capability: route.capability,
      mediaType: route.capability.endsWith("-image") ? "image" : route.capability === "video-to-audio" ? "audio" : "video",
      description: route.description.slice(0, 500),
      defaults: route.defaults,
      parameters: (route.inputSchema.parameters ?? []).map((parameter) => ({
        key: parameter.key,
        type: parameter.type,
        required: parameter.required ?? false,
        defaultValue: parameter.defaultValue,
        optionValues: parameter.options?.slice(0, 30).map((option) => option.value),
        min: parameter.min,
        max: parameter.max,
      })),
      assets: (route.inputSchema.assets ?? []).map((asset) => ({
        key: asset.key,
        mediaType: asset.mediaType,
        required: asset.required ?? false,
        multiple: asset.multiple ?? false,
        minFiles: asset.minFiles,
        maxFiles: asset.maxFiles,
      })),
    }));
  }
}

function constrainDraftToRequestedTargets(
  draft: PipelineSpecialistDraft,
  targetNodeIds: string[],
): PipelineSpecialistDraft {
  if (!targetNodeIds.length || draft.kind === "prompt") return draft;
  if (draft.kind === "script") {
    const episodes = completeTargetCoverage(draft.episodes, targetNodeIds, "script episode");
    return { ...draft, episodes };
  }
  if (draft.kind === "storyboard") {
    const shots = completeTargetCoverage(draft.shots, targetNodeIds, "storyboard shot");
    return { ...draft, shots };
  }
  const assets = completeTargetCoverage(draft.assets, targetNodeIds, "asset").map((item) => ({
    ...item,
    action: "update" as const,
  }));
  return { ...draft, assets };
}

function completeTargetCoverage<T extends { targetNodeId?: string }>(
  items: T[],
  targetNodeIds: string[],
  label: string,
): Array<T & { targetNodeId: string }> {
  const requested = [...new Set(targetNodeIds)];
  const allowed = new Set(requested);
  const matching = items.filter((item): item is T & { targetNodeId: string } => (
    Boolean(item.targetNodeId && allowed.has(item.targetNodeId))
  ));
  if (requested.length === 1 && matching.length === 0 && items.length === 1) {
    return [{ ...items[0]!, targetNodeId: requested[0]! }];
  }
  const counts = new Map(requested.map((nodeId) => [nodeId, 0]));
  for (const item of matching) counts.set(item.targetNodeId, (counts.get(item.targetNodeId) ?? 0) + 1);
  const missing = requested.filter((nodeId) => counts.get(nodeId) !== 1);
  if (missing.length) {
    throw new AppError(
      "PIPELINE_SPECIALIST_OUTPUT_INVALID",
      `The Specialist ${label} output does not cover every requested target exactly once`,
      422,
      { targetNodeIds: requested, invalidTargetNodeIds: missing },
    );
  }
  const byTarget = new Map(matching.map((item) => [item.targetNodeId, item]));
  return requested.map((nodeId) => byTarget.get(nodeId)!);
}

function assetFallbackDraft(input: PipelineSpecialistRequest): AssetSpecialistDraft {
  const identityKey = `${input.episodeKey?.trim() || "project"}-production-world`;
  return {
    kind: "asset",
    summary: "模型结构化输出不可用，已建立可继续细化的共享场景资产",
    warnings: [{
      code: "ASSET_OUTPUT_FALLBACK",
      message: "The Asset Specialist repair failed; created a conservative shared production-world asset from the confirmed objective",
      nodeIds: input.sourceNodeIds,
      blocking: false,
    }],
    assets: [{
      action: "create",
      assetType: "scene",
      identityKey,
      canonicalName: "项目统一场景与视觉基准",
      aliases: [],
      visualDescription: input.objective,
      continuityFacts: [
        input.constraints.aspectRatio ? `画幅 ${input.constraints.aspectRatio}` : "保持统一画幅",
        input.constraints.tone ? `基调 ${input.constraints.tone}` : "保持统一视觉基调",
      ],
      sourceNodeIds: input.sourceNodeIds,
      confidence: "medium",
    }],
    unresolvedMentions: [],
  };
}

function storyboardFallbackDraft(input: PipelineSpecialistRequest): StoryboardSpecialistDraft {
  const totalDurationSeconds = input.constraints.targetDurationSeconds ?? 60;
  const shotCount = Math.min(20, Math.max(1, Math.ceil(totalDurationSeconds / 8)));
  const baseDuration = Math.floor((totalDurationSeconds / shotCount) * 10) / 10;
  const shots = Array.from({ length: shotCount }, (_, index) => ({
    shotKey: `${input.episodeKey?.trim() || "episode"}-shot-${index + 1}`,
    order: index,
    durationSeconds: index === shotCount - 1
      ? Math.round((totalDurationSeconds - baseDuration * (shotCount - 1)) * 10) / 10
      : baseDuration,
    purpose: index === 0 ? "建立情境与核心钩子" : index === shotCount - 1 ? "完成情绪或悬念收束" : "推进核心动作与信息",
    visual: input.objective,
    subjects: [],
    shotSize: index === 0 ? "全景" : "中景",
    cameraMovement: "克制推进",
    blocking: "主体位于安全构图区，动作关系清晰",
    lighting: input.constraints.tone || "延续项目统一光线与色调",
    ambience: "与场景一致的环境声",
  }));
  return {
    kind: "storyboard",
    episodeKey: input.episodeKey,
    sourceNodeIds: input.sourceNodeIds,
    totalDurationSeconds,
    summary: "模型结构化输出不可用，已按目标时长建立可继续编辑的基础镜头表",
    warnings: [{
      code: "STORYBOARD_OUTPUT_FALLBACK",
      message: "The Storyboard Specialist repair failed; created a conservative timed shot list from the confirmed objective",
      nodeIds: input.sourceNodeIds,
      blocking: false,
    }],
    shots,
  };
}

function scriptFallbackDraft(input: PipelineSpecialistRequest): ScriptSpecialistDraft {
  const duration = input.constraints.targetDurationSeconds ?? 60;
  const key = input.episodeKey?.trim() || "episode-1";
  const title = input.objective.trim().slice(0, 80);
  return {
    kind: "script",
    format: "short-video",
    title,
    logline: input.objective,
    targetDurationSeconds: duration,
    summary: "模型结构化输出不可用，已根据用户目标建立可继续编辑的保守剧本草案",
    warnings: [{
      code: "SCRIPT_OUTPUT_FALLBACK",
      message: "The Script Specialist repair failed; created a conservative editable script draft from the confirmed objective",
      nodeIds: input.sourceNodeIds,
      blocking: false,
    }],
    episodes: [{
      key,
      title,
      objective: input.objective,
      estimatedDurationSeconds: duration,
      targetNodeId: input.targetNodeIds[0],
      scenes: [{
        key: `${key}-scene-1`,
        heading: "开场与情境建立",
        location: "按用户目标确定",
        time: "按用户目标确定",
        purpose: "建立人物、环境与核心冲突",
        content: input.objective,
        characterNames: [],
      }],
    }],
  };
}

function promptFallbackDraft(sourceNodeIds: string[]): PromptSpecialistDraft {
  return {
    kind: "prompt",
    summary: "根据已选创作规格生成基础媒体配置",
    warnings: [{
      code: "PROMPT_OUTPUT_FALLBACK",
      message: "The Prompt Specialist repair failed; synthesized conservative configurations from selected creative specifications",
      nodeIds: sourceNodeIds,
      blocking: false,
    }],
    configurations: [],
  };
}

function normalizePromptRoutes(
  draft: PromptSpecialistDraft,
  routes: PipelineSpecialistRouteContext[],
  nodes: CanvasNode[],
): PromptSpecialistDraft {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const warnings = [...draft.warnings];
  const configurations = draft.configurations.map((rawConfiguration) => {
    const selected = routes.find((route) => route.id === rawConfiguration.routeId);
    const acceptedCounts = new Map<"image" | "video" | "audio", number>();
    const references = rawConfiguration.references.filter((reference) => {
      const node = nodeById.get(reference.sourceNodeId);
      const mediaType = node?.data?.type;
      if (mediaType !== "image" && mediaType !== "video" && mediaType !== "audio") return false;
      if (!selected) return true;
      const slots = selected.assets.filter((slot) => slot.mediaType === mediaType);
      if (!slots.length) return false;
      const maximum = slots.reduce((sum, slot) => sum + (slot.maxFiles ?? Number.POSITIVE_INFINITY), 0);
      const accepted = acceptedCounts.get(mediaType) ?? 0;
      if (accepted >= maximum) return false;
      acceptedCounts.set(mediaType, accepted + 1);
      return true;
    });
    let configuration = references.length === rawConfiguration.references.length
      ? rawConfiguration
      : { ...rawConfiguration, references };
    if (references.length !== rawConfiguration.references.length) {
      warnings.push({
        code: "PROMPT_INVALID_REFERENCE_REMOVED",
        message: `Removed ${rawConfiguration.references.length - references.length} reference(s) that do not point to existing media nodes`,
        nodeIds: [rawConfiguration.sourceSpecNodeId],
        blocking: false,
      });
    }
    if (selected) {
      const settings = normalizeRouteSettings(selected, configuration.settings);
      if (JSON.stringify(settings) !== JSON.stringify(configuration.settings)) {
        configuration = { ...configuration, settings };
        warnings.push({
          code: "PIPELINE_SETTINGS_AUTO_CORRECTED",
          message: `Removed or corrected settings that do not satisfy Route ${selected.id}`,
          nodeIds: [configuration.sourceSpecNodeId],
          blocking: false,
        });
      }
      if (routeAcceptsReferences(selected, configuration, nodeById)) return configuration;
    }
    const fallback = routes
      .filter((route) => route.mediaType === configuration.mediaType)
      .filter((route) => routeAcceptsReferences(route, configuration, nodeById))
      .filter((route) => route.parameters.every((parameter) => !parameter.required
        || parameter.defaultValue !== undefined
        || configuration.settings[parameter.key] !== undefined))
      .sort((left, right) => Number(right.capability === `text-to-${configuration.mediaType}`)
        - Number(left.capability === `text-to-${configuration.mediaType}`))[0];
    if (!fallback) return configuration;
    const settings = normalizeRouteSettings(fallback, configuration.settings);
    warnings.push({
      code: "PIPELINE_ROUTE_AUTO_CORRECTED",
      message: `Route ${configuration.routeId} could not satisfy available references; selected ${fallback.id}`,
      nodeIds: [configuration.sourceSpecNodeId],
      blocking: false,
    });
    return { ...configuration, routeId: fallback.id, settings };
  });
  return { ...draft, configurations, warnings };
}

function normalizeRouteSettings(
  route: PipelineSpecialistRouteContext,
  input: Record<string, CanvasGenerationSettingValue>,
): Record<string, CanvasGenerationSettingValue> {
  const settings: Record<string, CanvasGenerationSettingValue> = {};
  for (const parameter of route.parameters) {
    let value: unknown = input[parameter.key] ?? parameter.defaultValue;
    if (parameter.optionValues?.length && !parameter.optionValues.some((option) => Object.is(option, value))) {
      const desired = value;
      const numericOptions = parameter.optionValues.filter((option): option is number => typeof option === "number");
      value = typeof desired === "number" && numericOptions.length === parameter.optionValues.length
        ? numericOptions.reduce((closest, option) => Math.abs(option - desired) < Math.abs(closest - desired) ? option : closest)
        : parameter.defaultValue ?? parameter.optionValues[0];
    }
    if (typeof value === "number") {
      let numericValue = value;
      if (parameter.min !== undefined) numericValue = Math.max(parameter.min, numericValue);
      if (parameter.max !== undefined) numericValue = Math.min(parameter.max, numericValue);
      value = numericValue;
    }
    if (isGenerationSettingValue(value)) settings[parameter.key] = value;
  }
  return settings;
}

function ensurePromptConfigurations(
  draft: PromptSpecialistDraft,
  request: PipelineSpecialistRequest,
  routes: PipelineSpecialistRouteContext[],
  nodes: CanvasNode[],
): PromptSpecialistDraft {
  if (draft.configurations.length) return draft;
  const selected = new Map(nodes.filter((node) => request.sourceNodeIds.includes(node.id)).map((node) => [node.id, node]));
  const configurations: PromptSpecialistDraft["configurations"] = [];
  for (const nodeId of request.sourceNodeIds) {
    const node = selected.get(nodeId);
    const spec = node?.data?.creativeSpec;
    if (!node?.data || !spec || (spec.kind !== "asset" && spec.kind !== "shot")) continue;
    const mediaType = spec.kind === "asset" ? "image" : "video";
    const route = routes
      .filter((candidate) => candidate.mediaType === mediaType && requiredAssetCount(candidate.assets) === 0)
      .sort((left, right) => Number(right.capability === `text-to-${mediaType}`) - Number(left.capability === `text-to-${mediaType}`))[0];
    if (!route) continue;
    const settings = Object.fromEntries(route.parameters.flatMap((parameter) => !isGenerationSettingValue(parameter.defaultValue)
      ? []
      : [[parameter.key, parameter.defaultValue]]));
    configurations.push({
      sourceSpecNodeId: nodeId,
      name: `${node.data.name} ${mediaType === "image" ? "参考图" : "视频"}`,
      mediaType,
      routeId: route.id,
      prompt: renderFallbackPrompt(spec),
      settings,
      references: [],
    });
    if (configurations.length === 20) break;
  }
  if (!configurations.length) return draft;
  return {
    ...draft,
    configurations,
    warnings: [...draft.warnings, {
      code: "PROMPT_CONFIGURATION_SYNTHESIZED",
      message: "The model returned no media configurations; created conservative Route-ready configurations from selected creative specifications",
      nodeIds: configurations.map((configuration) => configuration.sourceSpecNodeId),
      blocking: false,
    }],
  };
}

function isGenerationSettingValue(value: unknown): value is CanvasGenerationSettingValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    || (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean"));
}

function renderFallbackPrompt(spec: Extract<CanvasCreativeSpec, { kind: "asset" | "shot" }>): string {
  if (spec.kind === "asset") {
    return [spec.canonicalName, spec.visualDescription, ...spec.continuityFacts].filter(Boolean).join(". ");
  }
  return [
    spec.visual,
    `Shot size: ${spec.shotSize}`,
    `Camera: ${spec.cameraMovement}`,
    `Blocking: ${spec.blocking}`,
    `Lighting: ${spec.lighting}`,
    ...spec.subjects.map((subject) => `${subject.identityKey}: ${subject.action}${subject.expression ? `, ${subject.expression}` : ""}`),
    `Target duration: ${spec.durationSeconds} seconds`,
  ].filter(Boolean).join(". ");
}

function requiredAssetCount(assets: Array<{ required?: boolean; minFiles?: number }>): number {
  return assets.reduce((sum, asset) => sum + (asset.minFiles ?? (asset.required ? 1 : 0)), 0);
}

function routeCatalogPriority(route: { capability: string; inputSchema: { assets?: Array<{ required?: boolean; minFiles?: number }> } }): number {
  const capabilityRank = route.capability.startsWith("text-to-") ? 0 : 10;
  return capabilityRank + requiredAssetCount(route.inputSchema.assets ?? []) * 100;
}

function routeAcceptsReferences(
  route: PipelineSpecialistRouteContext,
  configuration: PromptSpecialistDraft["configurations"][number],
  nodeById: Map<string, CanvasNode>,
): boolean {
  const referenceCounts = new Map<"image" | "video" | "audio", number>();
  for (const reference of configuration.references) {
    const type = nodeById.get(reference.sourceNodeId)?.data?.type;
    if (type !== "image" && type !== "video" && type !== "audio") return false;
    referenceCounts.set(type, (referenceCounts.get(type) ?? 0) + 1);
  }
  for (const [mediaType, count] of referenceCounts) {
    const matchingSlots = route.assets.filter((slot) => slot.mediaType === mediaType);
    if (!matchingSlots.length) return false;
    const maximum = matchingSlots.reduce((sum, slot) => sum + (slot.maxFiles ?? Number.POSITIVE_INFINITY), 0);
    if (count > maximum) return false;
  }
  return route.assets.every((slot) => {
    const minimum = slot.minFiles ?? (slot.required ? 1 : 0);
    if (minimum === 0) return true;
    const count = configuration.references.filter((reference) => nodeById.get(reference.sourceNodeId)?.data?.type === slot.mediaType).length;
    return count >= minimum;
  });
}

function validateRequest(input: PipelineSpecialistRequest): void {
  if (!input.objective.trim() || input.objective.length > 4_000) {
    throw new AppError("VALIDATION_ERROR", "Specialist objective must contain 1 to 4000 characters", 400);
  }
  if (input.sourceNodeIds.length > 40 || input.targetNodeIds.length > 40) {
    throw new AppError("PIPELINE_SPECIALIST_BATCH_REQUIRED", "A Specialist call can reference at most 40 source and target nodes", 409);
  }
  if (input.constraints.targetDurationSeconds !== undefined
    && (!Number.isFinite(input.constraints.targetDurationSeconds) || input.constraints.targetDurationSeconds <= 0 || input.constraints.targetDurationSeconds > 100_000)) {
    throw new AppError("VALIDATION_ERROR", "Specialist target duration is invalid", 400);
  }
}
