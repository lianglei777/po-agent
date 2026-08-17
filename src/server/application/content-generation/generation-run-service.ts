import { randomUUID } from "node:crypto";
import type {
  GenerationAssetSlot,
  GenerationParameterField,
  JsonValue,
} from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type {
  GenerationArtifact,
  GenerationCapability,
  GenerationInput,
  GenerationRoute,
  GenerationRun,
  GenerationRunStatus,
  GenerationSession,
  GenerationSource,
  ProviderJob,
} from "@/server/domain/generation";
import type { GenerationRepository } from "@/server/ports/generation-repository";
import type { SessionRepository } from "@/server/ports/session-repository";
import { GenerationRouter } from "./generation-router";

export interface GenerationRunView {
  run: GenerationRun;
  jobs: ProviderJob[];
  artifacts: GenerationArtifact[];
}

export interface CreateGenerationRunInput {
  sessionId: string;
  capability: GenerationCapability;
  routeId?: string;
  parentRunId?: string;
  prompt: string;
  originalPrompt?: string;
  assets?: GenerationInput["assets"];
  parameters?: Record<string, JsonValue>;
  source: GenerationSource;
  sourceRef?: string;
  idempotencyKey: string;
}

export class GenerationRunService {
  private readonly router: GenerationRouter;
  private readonly ready: Promise<unknown>;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly sessions?: SessionRepository;

  constructor(
    private readonly repository: GenerationRepository,
    options: {
      ready?: Promise<unknown>;
      createId?: () => string;
      now?: () => Date;
      sessions?: SessionRepository;
    } = {},
  ) {
    this.router = new GenerationRouter(repository);
    this.ready = options.ready ?? Promise.resolve();
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.sessions = options.sessions;
  }

  async upsertSession(session: GenerationSession): Promise<void> {
    await this.ready;
    await this.repository.upsertSession(session);
  }

  async requireSession(id: string): Promise<GenerationSession> {
    await this.ready;
    const session = await this.resolveSession(id);
    if (!session || session.deletedAt) {
      throw new AppError("SESSION_NOT_FOUND", "Session was not found", 404);
    }
    return session;
  }

  async createRun(
    input: CreateGenerationRunInput,
  ): Promise<GenerationRunView & { created: boolean }> {
    await this.ready;
    const { job, run } = await this.buildRun(input, "queued");
    const result = await this.repository.createRun(run, job);
    if (!result.created && !sameRequest(result.run, run)) {
      throw new AppError(
        "GENERATION_IDEMPOTENCY_CONFLICT",
        "The generation idempotency key was already used for another request",
        409,
      );
    }
    return {
      created: result.created,
      run: result.run,
      jobs: await this.repository.listJobsByRun(result.run.id),
      artifacts: await this.repository.listArtifactsByRun(result.run.id),
    };
  }

  async prepareRun(
    input: CreateGenerationRunInput,
  ): Promise<GenerationRunView & { created: boolean }> {
    await this.ready;
    const { run } = await this.buildRun(input, "awaiting_confirmation");
    const result = await this.repository.createRun(run);
    if (!result.created && !sameRequest(result.run, run)) {
      throw new AppError(
        "GENERATION_IDEMPOTENCY_CONFLICT",
        "The generation idempotency key was already used for another request",
        409,
      );
    }
    return {
      created: result.created,
      run: result.run,
      jobs: await this.repository.listJobsByRun(result.run.id),
      artifacts: await this.repository.listArtifactsByRun(result.run.id),
    };
  }

  async confirmRun(
    id: string,
    input: { prompt: string; parameters?: Record<string, JsonValue> },
  ): Promise<GenerationRunView> {
    await this.ready;
    const current = await this.repository.getRun(id);
    if (!current) {
      throw new AppError(
        "GENERATION_RUN_NOT_FOUND",
        "Generation run was not found",
        404,
      );
    }
    if (current.status !== "awaiting_confirmation") {
      if (current.status !== "cancelled") {
        return (await this.getRun(id))!;
      }
      throw new AppError(
        "GENERATION_RUN_NOT_CONFIRMABLE",
        "Generation run is no longer awaiting confirmation",
        409,
      );
    }
    const route = await this.router.resolve({
      capability: current.capability,
      routeId: current.routeId,
    });
    await this.requireProviderEnabled(route);
    const prompt = validatePrompt(input.prompt, route.inputSchema.prompt);
    const parameters = validateParameters(
      route.inputSchema.parameters ?? [],
      route.defaults,
      input.parameters,
    );
    validateAssets(route.inputSchema.assets ?? [], current.input.assets ?? []);
    const timestamp = this.now().toISOString();
    const run: GenerationRun = {
      ...current,
      status: "queued",
      prompt,
      input: { ...current.input, prompt, parameters },
      updatedAt: timestamp,
    };
    const result = await this.repository.confirmRun(
      run,
      this.createInitialJob(run, route, parameters, timestamp),
    );
    if (!result) {
      const latest = await this.getRun(id);
      if (latest && latest.run.status !== "awaiting_confirmation") return latest;
      throw new AppError(
        "GENERATION_RUN_NOT_CONFIRMABLE",
        "Generation run is no longer awaiting confirmation",
        409,
      );
    }
    return (await this.getRun(id))!;
  }

  async getRun(id: string): Promise<GenerationRunView | null> {
    await this.ready;
    const run = await this.repository.getRun(id);
    if (!run) return null;
    return {
      run,
      jobs: await this.repository.listJobsByRun(id),
      artifacts: await this.repository.listArtifactsByRun(id),
    };
  }

  async listRoutes() {
    await this.ready;
    return this.repository.listRoutes();
  }

  async getRoute(id: string) {
    await this.ready;
    return this.repository.getRoute(id);
  }

  async getProviderSettings(providerId: string) {
    await this.ready;
    return { providerId, enabled: await this.repository.isProviderEnabled(providerId) };
  }

  async setProviderEnabled(providerId: string, enabled: boolean) {
    await this.ready;
    await this.repository.setProviderEnabled(providerId, enabled, this.now().toISOString());
    return { providerId, enabled };
  }

  async setRouteEnabled(routeId: string, enabled: boolean) {
    await this.ready;
    if (!await this.repository.setRouteEnabled(routeId, enabled, this.now().toISOString())) {
      throw new AppError("GENERATION_ROUTE_NOT_FOUND", "Generation route was not found", 404);
    }
    return (await this.repository.getRoute(routeId))!;
  }

  async cancelRun(id: string): Promise<GenerationRunView> {
    await this.ready;
    const run = await this.repository.getRun(id);
    if (!run) {
      throw new AppError("GENERATION_RUN_NOT_FOUND", "Generation run was not found", 404);
    }
    if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
      return (await this.getRun(id))!;
    }
    const timestamp = this.now().toISOString();
    const cancelled = await this.repository.updateRun({
      ...run,
      status: "cancelled",
      updatedAt: timestamp,
      completedAt: timestamp,
    }, ["awaiting_confirmation", "queued", "running", "cancel_requested"]);
    if (!cancelled) return (await this.getRun(id))!;
    const jobs = await this.repository.listJobsByRun(id);
    for (const job of jobs) {
      if (["succeeded", "failed", "cancelled", "submission_unknown"].includes(job.status)) continue;
      await this.repository.updateJob({
        ...job,
        status: "cancelled",
        nextPollAt: undefined,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: timestamp,
      }, ["created", "uploading", "submitting", "submitted", "polling", "downloading"]);
    }
    return (await this.getRun(id))!;
  }

  async retryRun(id: string, idempotencyKey: string) {
    await this.ready;
    const run = await this.repository.getRun(id);
    if (!run) {
      throw new AppError("GENERATION_RUN_NOT_FOUND", "Generation run was not found", 404);
    }
    const retryKey = idempotencyKey.trim();
    if (!retryKey || retryKey.length > 200) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generation retry idempotency key must contain between 1 and 200 characters",
        400,
      );
    }
    const route = await this.router.resolve({
      capability: run.capability,
      routeId: run.routeId,
    });
    await this.requireProviderEnabled(route);
    // 重试仍可能产生新费用；旧 Run 也必须通过当前 Route 契约，避免重新提交历史上的无效输入。
    validatePrompt(run.prompt, route.inputSchema.prompt);
    validateParameters(
      route.inputSchema.parameters ?? [],
      route.defaults,
      run.input.parameters,
    );
    validateAssets(route.inputSchema.assets ?? [], run.input.assets ?? []);
    const jobs = await this.repository.listJobsByRun(id);
    const previous = jobs.at(-1);
    if (!previous) throw new Error(`Generation run ${id} has no provider job`);
    const timestamp = this.now().toISOString();
    const nextRun: GenerationRun = {
      ...run,
      status: "queued",
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: timestamp,
      completedAt: undefined,
    };
    const nextJob: ProviderJob = {
      id: this.createId(),
      runId: run.id,
      attempt: previous.attempt + 1,
      providerId: previous.providerId,
      providerOperation: previous.providerOperation,
      routeRevision: previous.routeRevision,
      resolvedConfigSnapshot: previous.resolvedConfigSnapshot,
      credentialRef: previous.credentialRef,
      retryKey,
      status: "created",
      nextPollAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const result = await this.repository.createRetryJob(nextRun, nextJob);
    if (!result) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generation run is no longer retryable",
        409,
      );
    }
    return {
      created: result.created,
      run: result.run,
      jobs: await this.repository.listJobsByRun(run.id),
      artifacts: await this.repository.listArtifactsByRun(run.id),
    };
  }

  async listRuns(sessionId: string): Promise<GenerationRunView[]> {
    await this.ready;
    await this.requireSession(sessionId);
    return this.listRunViews(sessionId);
  }

  async listRunsForContext(sessionId: string): Promise<GenerationRunView[]> {
    await this.ready;
    if (!await this.resolveSession(sessionId)) return [];
    // 新建 Pi Session 在首条 Prompt 持久化前可能尚无仓库记录；可选上下文不应因此阻断普通对话。
    return this.listRunViews(sessionId);
  }

  private async listRunViews(sessionId: string): Promise<GenerationRunView[]> {
    const runs = await this.repository.listRunsBySession(sessionId);
    return Promise.all(runs.map(async (run) => ({
      run,
      jobs: await this.repository.listJobsByRun(run.id),
      artifacts: await this.repository.listArtifactsByRun(run.id),
    })));
  }

  private async buildRun(
    input: CreateGenerationRunInput,
    status: Extract<
      GenerationRunStatus,
      "awaiting_confirmation" | "queued"
    >,
  ) {
    const session = await this.requireSession(input.sessionId);
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generation idempotency key must contain between 1 and 200 characters",
        400,
      );
    }
    const route = await this.router.resolve({
      capability: input.capability,
      routeId: input.routeId,
    });
    await this.requireProviderEnabled(route);
    const prompt = validatePrompt(input.prompt, route.inputSchema.prompt);
    const parameters = validateParameters(
      route.inputSchema.parameters ?? [],
      route.defaults,
      input.parameters,
    );
    validateAssets(route.inputSchema.assets ?? [], input.assets ?? []);
    const timestamp = this.now().toISOString();
    const run: GenerationRun = {
      id: this.createId(),
      sessionId: session.id,
      capability: input.capability,
      routeId: route.id,
      parentRunId: input.parentRunId,
      status,
      prompt,
      input: {
        prompt,
        originalPrompt: input.originalPrompt?.trim() || undefined,
        assets: input.assets,
        parameters,
      },
      source: input.source,
      sourceRef: input.sourceRef,
      idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      run,
      job:
        status === "queued"
          ? this.createInitialJob(run, route, parameters, timestamp)
          : undefined,
    };
  }

  private createInitialJob(
    run: GenerationRun,
    route: GenerationRoute,
    parameters: Record<string, JsonValue>,
    timestamp: string,
  ): ProviderJob {
    return {
      id: this.createId(),
      runId: run.id,
      attempt: 1,
      providerId: route.providerId,
      providerOperation: route.providerOperation,
      routeRevision: route.revision,
      resolvedConfigSnapshot: {
        parameters,
        adapterConfig: route.adapterConfig,
      },
      credentialRef: route.credentialRef,
      status: "created",
      nextPollAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private async requireProviderEnabled(route: GenerationRoute): Promise<void> {
    if (await this.repository.isProviderEnabled(route.providerId)) return;
    throw new AppError(
      "GENERATION_PROVIDER_DISABLED",
      `${route.providerId} content generation is not enabled`,
      403,
    );
  }

  private async resolveSession(id: string): Promise<GenerationSession | null> {
    const stored = await this.repository.getSession(id);
    if (stored) return stored;
    const detail = await this.sessions?.findById(id);
    if (!detail?.info) return null;
    const projected: GenerationSession = {
      id: detail.sessionId,
      cwd: detail.info.cwd,
      title: detail.info.name,
      origin: "chat",
      agentSessionRef: detail.filePath,
      createdAt: detail.info.created,
      updatedAt: detail.info.modified,
    };
    await this.repository.upsertSession(projected);
    return projected;
  }
}

function validatePrompt(
  value: string,
  rule: { required: boolean; minLength?: number; maxLength?: number },
) {
  const prompt = value.trim();
  const minLength = rule.minLength ?? (rule.required ? 1 : 0);
  const maxLength = rule.maxLength ?? 20_480;
  if (prompt.length < minLength || prompt.length > maxLength) {
    throw new AppError(
      "VALIDATION_ERROR",
      minLength > 0
        ? `Generation prompt must contain between ${minLength} and ${maxLength} characters`
        : `Generation prompt must not exceed ${maxLength} characters`,
      400,
    );
  }
  return prompt;
}

function validateParameters(
  fields: GenerationParameterField[],
  defaults: Record<string, JsonValue>,
  input: Record<string, JsonValue> | undefined,
) {
  const definitions = new Map(fields.map((field) => [field.key, field]));
  for (const key of Object.keys(input ?? {})) {
    if (!definitions.has(key)) invalidInput(`Unknown generation parameter: ${key}`);
  }
  // 字段默认值是契约基线，Route 默认值可覆盖它，用户或 Agent 的显式输入优先级最高。
  const fieldDefaults = Object.fromEntries(
    fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, structuredClone(field.defaultValue) as JsonValue]),
  );
  const parameters = { ...fieldDefaults, ...defaults, ...input };
  for (const field of fields) {
    const value = parameters[field.key];
    if (value === undefined) {
      if (field.required) invalidInput(`Generation parameter is required: ${field.key}`);
      continue;
    }
    validateParameter(field, value);
  }
  return parameters;
}

function validateParameter(field: GenerationParameterField, value: JsonValue) {
  if (field.type === "text" && typeof value !== "string") {
    invalidInput(`Generation parameter must be text: ${field.key}`);
  }
  if (field.type === "number") {
    if (typeof value !== "number") invalidInput(`Generation parameter must be a number: ${field.key}`);
    if (field.min !== undefined && value < field.min) invalidInput(`Generation parameter is below its minimum: ${field.key}`);
    if (field.max !== undefined && value > field.max) invalidInput(`Generation parameter exceeds its maximum: ${field.key}`);
  }
  if (field.type === "boolean" && typeof value !== "boolean") {
    invalidInput(`Generation parameter must be a boolean: ${field.key}`);
  }
  if (field.type === "select") {
    const allowed = field.options?.some((option) => option.value === value) ?? false;
    if (!allowed) invalidInput(`Generation parameter has an unsupported option: ${field.key}`);
  }
  if (field.type === "multi-select") {
    const options = new Set(field.options?.map((option) => option.value) ?? []);
    if (!Array.isArray(value) || value.some((item) => !options.has(item as string))) {
      invalidInput(`Generation parameter has unsupported options: ${field.key}`);
    }
  }
}

function validateAssets(
  slots: GenerationAssetSlot[],
  assets: NonNullable<GenerationInput["assets"]>,
) {
  const definitions = new Map(slots.map((slot) => [slot.key, slot]));
  const counts = new Map<string, number>();
  for (const asset of assets) {
    if (!definitions.has(asset.slot)) invalidInput(`Unknown generation asset slot: ${asset.slot}`);
    counts.set(asset.slot, (counts.get(asset.slot) ?? 0) + 1);
  }
  for (const slot of slots) {
    const count = counts.get(slot.key) ?? 0;
    const minimum = slot.minFiles ?? (slot.required ? 1 : 0);
    const maximum = slot.maxFiles ?? (slot.multiple ? Number.POSITIVE_INFINITY : 1);
    if (count < minimum) invalidInput(`Generation asset slot requires at least ${minimum} file(s): ${slot.key}`);
    if (count > maximum) invalidInput(`Generation asset slot accepts at most ${maximum} file(s): ${slot.key}`);
  }
}

function invalidInput(message: string): never {
  throw new AppError("VALIDATION_ERROR", message, 400);
}

function sameRequest(existing: GenerationRun, requested: GenerationRun): boolean {
  return (
    existing.sessionId === requested.sessionId &&
    existing.capability === requested.capability &&
    existing.routeId === requested.routeId &&
    existing.prompt === requested.prompt &&
    JSON.stringify(existing.input) === JSON.stringify(requested.input)
  );
}
