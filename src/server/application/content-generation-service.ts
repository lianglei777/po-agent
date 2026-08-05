import { randomUUID } from "node:crypto";
import type {
  ContentGenerationApi,
  ContentGenerationJob,
  ContentGenerationOutput,
  ContentGenerationSession,
  ContentGenerationInputSchema,
  ContentGenerationProvider as PublicContentGenerationProvider,
  JsonValue,
  SaveContentGenerationApiRequest,
  SaveContentGenerationProviderRequest,
} from "@/contracts/content-generation";
import type { SessionInfo } from "@/contracts/sessions";
import type {
  ContentGenerationInputFile,
  StoredContentGenerationApi,
  StoredContentGenerationProvider,
} from "@/server/domain/content-generation";
import { AppError } from "@/server/domain/app-error";
import type { ContentGenerationProvider, ContentGenerationArtifactStore } from "@/server/ports/content-generation-provider";
import type { ContentGenerationRepository } from "@/server/ports/content-generation-repository";
import type { WorkspaceRootProvider } from "@/server/ports/file-system";
import { resolveAllowedCwd } from "./resolve-allowed-cwd";
import {
  BUILTIN_RUNNINGHUB_PROVIDER_ID,
  createBuiltinRunningHubApisStored,
  createBuiltinRunningHubProviderStored,
} from "./builtin-content-generation";

type Variables = Record<string, unknown>;

export class ContentGenerationService {
  constructor(
    private readonly repository: ContentGenerationRepository,
    private readonly provider: ContentGenerationProvider,
    private readonly artifacts: ContentGenerationArtifactStore,
    private readonly roots: WorkspaceRootProvider,
  ) {}

  async listApis(): Promise<ContentGenerationApi[]> {
    const state = await this.repository.read();
    // 合并内置 RunningHub API--按 catalogId 去重，已存储的同 catalog 项优先
    const storedCatalogIds = new Set(
      state.apis.map((api) => api.catalogId).filter(Boolean),
    );
    const builtinApis = builtinRunningHubApis(state.providers);
    const merged = [
      ...state.apis,
      ...builtinApis.filter((api) => !storedCatalogIds.has(api.catalogId)),
    ];
    return merged.map(publicApi);
  }

  async listProviders(): Promise<PublicContentGenerationProvider[]> {
    const state = await this.repository.read();
    // 合并内置 RunningHub 供应商--已存储的同类型项优先
    const hasStoredRunninghub = state.providers.some(
      (provider) => provider.type === "runninghub",
    );
    const merged = hasStoredRunninghub
      ? state.providers
      : [builtinRunningHubProvider(), ...state.providers];
    return merged.map(publicProvider);
  }

  async saveProvider(input: SaveContentGenerationProviderRequest) {
    const state = await this.repository.read();
    const existing = state.providers.find((provider) => provider.id === input.id);
    const provider = {
      ...input,
      apiKey: input.apiKey?.trim() || existing?.apiKey,
    };
    const index = state.providers.findIndex((item) => item.id === input.id);
    if (index === -1) state.providers.push(provider);
    else state.providers[index] = provider;
    await this.repository.write(state);
    return publicProvider(provider);
  }

  async deleteProvider(id: string) {
    const state = await this.repository.read();
    if (state.apis.some((api) => api.providerId === id)) {
      throw new AppError(
        "CONTENT_PROVIDER_IN_USE",
        "Content provider still contains APIs",
        409,
      );
    }
    const next = state.providers.filter((provider) => provider.id !== id);
    if (next.length === state.providers.length) {
      throw new AppError("CONTENT_PROVIDER_NOT_FOUND", "Content provider was not found", 404);
    }
    state.providers = next;
    await this.repository.write(state);
  }

  async saveApi(input: SaveContentGenerationApiRequest) {
    const state = await this.repository.read();
    // 内置 RunningHub 供应商无需事先存储即可挂载 API
    const providerExists = state.providers.some((provider) => provider.id === input.providerId)
      || input.providerId === BUILTIN_RUNNINGHUB_PROVIDER_ID;
    if (!providerExists) {
      throw new AppError("CONTENT_PROVIDER_NOT_FOUND", "Content provider was not found", 404);
    }
    const existing = state.apis.find((api) => api.id === input.id);
    const api = {
      ...input,
      apiKey: input.credentialMode === "override"
        ? input.apiKey?.trim() || existing?.apiKey
        : undefined,
    };
    const index = state.apis.findIndex((item) => item.id === input.id);
    if (index === -1) state.apis.push(api);
    else state.apis[index] = api;
    await this.repository.write(state);
    return publicApi(api);
  }

  async deleteApi(id: string) {
    const state = await this.repository.read();
    if (state.sessions.some((session) => session.apiId === id)) {
      throw new AppError(
        "CONTENT_API_IN_USE",
        "Content generation API is used by an existing session",
        409,
      );
    }
    const next = state.apis.filter((api) => api.id !== id);
    if (next.length === state.apis.length) {
      throw new AppError("CONTENT_API_NOT_FOUND", "Content generation API was not found", 404);
    }
    state.apis = next;
    await this.repository.write(state);
  }

  async createSession(input: { cwd: string; apiId: string }) {
    const cwd = await resolveAllowedCwd(input.cwd, this.roots);
    const api = await this.requiredApi(input.apiId);
    const now = new Date().toISOString();
    const session: ContentGenerationSession = {
      id: randomUUID(),
      cwd,
      apiId: api.id,
      apiName: api.name,
      created: now,
      modified: now,
    };
    const state = await this.repository.read();
    state.sessions.push(session);
    await this.repository.write(state);
    return session;
  }

  async listSessionInfo(): Promise<SessionInfo[]> {
    const state = await this.repository.read();
    return state.sessions.map((session) => {
      const jobs = state.jobs
        .filter((job) => job.sessionId === session.id)
        .sort((left, right) => left.created.localeCompare(right.created));
      const latestJob = jobs.at(-1);
      return {
        id: session.id,
        path: `content-generation:${session.id}`,
        cwd: session.cwd,
        name: session.name,
        created: session.created,
        modified: session.modified,
        messageCount: jobs.length * 2,
        firstMessage: jobs[0]?.prompt ?? session.apiName,
        mode: "content-generation",
        contentGenerationApiId: session.apiId,
        contentGenerationPhase: latestJob?.phase,
      };
    });
  }

  getSession(id: string) {
    return this.repository.getSession(id);
  }

  async renameSession(id: string, name: string) {
    const state = await this.repository.read();
    const session = state.sessions.find((item) => item.id === id);
    if (!session) return false;
    session.name = name.trim();
    session.modified = new Date().toISOString();
    await this.repository.write(state);
    return true;
  }

  async deleteSession(id: string) {
    const state = await this.repository.read();
    if (!state.sessions.some((session) => session.id === id)) return false;
    state.sessions = state.sessions.filter((session) => session.id !== id);
    state.jobs = state.jobs.filter((job) => job.sessionId !== id);
    await this.repository.write(state);
    return true;
  }

  async listJobs(sessionId: string) {
    const state = await this.repository.read();
    return state.jobs.filter((job) => job.sessionId === sessionId);
  }

  async createJob(input: {
    sessionId: string;
    prompt: string;
    parameters?: Record<string, JsonValue>;
    files: ContentGenerationInputFile[];
  }) {
    const session = await this.requiredSession(input.sessionId);
    const api = await this.requiredApi(session.apiId);
    const parameters = validateJobInput(
      api,
      input.prompt,
      input.parameters ?? {},
      input.files,
    );
    const state = await this.repository.read();
    if (
      state.jobs.some(
        (job) => job.sessionId === session.id && isActive(job.phase),
      )
    ) {
      throw new AppError(
        "CONTENT_JOB_ACTIVE",
        "This session already has a running generation job",
        409,
      );
    }
    const now = new Date().toISOString();
    const job: ContentGenerationJob = {
      id: randomUUID(),
      sessionId: session.id,
      apiId: api.id,
      phase: "created",
      prompt: input.prompt.trim(),
      parameters,
      uploadedUrls: [],
      uploadedAssets: [],
      outputs: [],
      created: now,
      modified: now,
    };
    state.jobs.push(job);
    await this.repository.write(state);

    try {
      if (input.files.length) {
        job.phase = "uploading";
        await this.persistJob(job);
        job.uploadedAssets = await this.uploadFiles(api, input.files);
        job.uploadedUrls = job.uploadedAssets.map((asset) => asset.url);
      }
      job.phase = "submitting";
      const variables = variablesFor(api, job);
      const submitBody = renderJson(api.submit.bodyTemplate, variables);
      job.submitRequest = providerResponseSnapshot(submitBody ?? null);
      await this.persistJob(job);
      const response = await this.provider.request(
        api.submit,
        renderHeaders(api, api.submit.headers, variables),
        submitBody,
      );
      job.submitResponse = providerResponseSnapshot(response);
      job.remoteTaskId = stringAt(response, api.submit.taskIdPath);
      job.remoteStatus = stringAt(response, api.submit.statusPath);
      if (api.completion.mode === "immediate") {
        return await this.completeJob(job, api, response, session.cwd);
      }
      if (
        job.remoteStatus &&
        api.completion.successValues.includes(job.remoteStatus)
      ) {
        return this.completeJob(job, api, response, session.cwd);
      }
      if (
        job.remoteStatus &&
        api.completion.failureValues.includes(job.remoteStatus)
      ) {
        throw new Error(
          stringAt(response, api.completion.errorPath) ||
            "Content generation failed",
        );
      }
      if (!job.remoteTaskId) {
        throw new AppError(
          "CONTENT_PROVIDER_PROTOCOL_ERROR",
          "Content provider did not return a task ID",
          502,
        );
      }
      job.phase = pendingPhase(job.remoteStatus, api.completion.pendingValues);
      await this.persistJob(job);
      return job;
    } catch (error) {
      return this.failJob(job, job.phase === "uploading" ? "upload" : "submit", error);
    }
  }

  async pollJob(id: string) {
    const job = await this.requiredJob(id);
    // 查询阶段失败的 job 允许重新轮询--远端任务仍然存在，用户无需重新付费提交
    const retryable = job.phase === "failed"
      && job.error?.stage === "query"
      && Boolean(job.remoteTaskId);
    if (!isActive(job.phase) && !retryable) return job;
    const session = await this.requiredSession(job.sessionId);
    const api = await this.requiredApi(job.apiId);
    if (api.completion.mode !== "polling" || !job.remoteTaskId) return job;
    // 手动重试时跳过超时检查--用户主动查询已付费任务，不应被原始超时窗口阻止
    if (!retryable && Date.now() - new Date(job.created).getTime() > api.completion.timeoutMs) {
      return this.failJob(
        job,
        "query",
        new Error("Content generation timed out"),
      );
    }
    // 重试前恢复到 pending 状态，清除上次的查询错误
    if (retryable) {
      job.phase = pendingPhase(job.remoteStatus, api.completion.pendingValues);
      delete job.error;
      await this.persistJob(job);
    }
    try {
      const variables = variablesFor(api, job);
      const response = await this.provider.request(
        api.completion.request,
        renderHeaders(api, api.completion.request.headers, variables),
        renderJson(api.completion.request.bodyTemplate, variables),
      );
      job.latestQueryResponse = providerResponseSnapshot(response);
      const status = stringAt(response, api.completion.statusPath);
      job.remoteStatus = status;
      delete job.error;
      if (status && api.completion.successValues.includes(status)) {
        return this.completeJob(job, api, response, session.cwd);
      }
      if (status && api.completion.failureValues.includes(status)) {
        const message = stringAt(response, api.completion.errorPath) || "Content generation failed";
        return this.failJob(job, "query", new Error(message));
      }
      job.phase = pendingPhase(status, api.completion.pendingValues);
      await this.persistJob(job);
      return job;
    } catch (error) {
      // 查询失败不清除远端任务 ID，用户可以继续查询同一个付费任务。
      job.error = { stage: "query", message: errorMessage(error) };
      job.modified = new Date().toISOString();
      await this.persistJob(job);
      return job;
    }
  }

  private async uploadFiles(api: Awaited<ReturnType<ContentGenerationService["requiredApi"]>>, files: ContentGenerationInputFile[]) {
    if (!api.upload) {
      throw new AppError("CONTENT_UPLOAD_UNSUPPORTED", "This API does not configure file upload", 400);
    }
    const assets: NonNullable<ContentGenerationJob["uploadedAssets"]> = [];
    for (const file of files) {
      const variables = { secret: { apiKey: api.apiKey ?? "" } };
      const response = await this.provider.upload(
        api.upload,
        file,
        renderHeaders(api, api.upload.headers, variables),
      );
      if (api.upload.successPath && api.upload.successValues?.length) {
        const value = valueAt(response, api.upload.successPath);
        if (!api.upload.successValues.includes(value as never)) {
          throw new Error(stringAt(response, api.upload.errorPath) || "File upload failed");
        }
      }
      const url = stringAt(response, api.upload.urlPath);
      if (!url) throw new Error("Upload API did not return a file URL");
      const slot = api.inputSchema?.assets?.find((item: { key: string }) => item.key === file.slot);
      assets.push({
        slot: file.slot,
        name: file.name,
        mediaType: slot?.mediaType ?? mediaTypeFromMime(file.mimeType),
        url,
      });
    }
    return assets;
  }

  private async completeJob(
    job: ContentGenerationJob,
    api: Awaited<ReturnType<ContentGenerationService["requiredApi"]>>,
    response: unknown,
    cwd: string,
  ) {
    const collection = valueAt(response, api.output.collectionPath);
    const items = Array.isArray(collection) ? collection : collection ? [collection] : [];
    const outputs: ContentGenerationOutput[] = [];
    job.phase = "downloading";
    await this.persistJob(job);
    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const remoteUrl = stringAt(item, api.output.urlPath);
        const outputType = stringAt(item, api.output.typePath);
        const text = stringAt(item, api.output.textPath);
        const output: ContentGenerationOutput = {
          remoteUrl: remoteUrl || undefined,
          outputType: outputType || undefined,
          text: text || undefined,
        };
        if (remoteUrl && api.output.downloadRemoteFiles) {
          const downloaded = await this.provider.download(remoteUrl);
          output.contentType = downloaded.contentType;
          output.localPath = await this.artifacts.save({
            cwd,
            jobId: job.id,
            index,
            extension: outputType || extensionFromContentType(downloaded.contentType),
            data: downloaded.data,
          });
        }
        outputs.push(output);
      }
      if (!outputs.length) throw new Error("Content provider returned no outputs");
      job.outputs = outputs;
      job.phase = "succeeded";
      delete job.error;
      await this.persistJob(job);
      return job;
    } catch (error) {
      return this.failJob(job, "download", error);
    }
  }

  private async failJob(job: ContentGenerationJob, stage: NonNullable<ContentGenerationJob["error"]>["stage"], error: unknown) {
    job.phase = "failed";
    job.error = { stage, message: errorMessage(error) };
    await this.persistJob(job);
    return job;
  }

  private async persistJob(job: ContentGenerationJob) {
    const state = await this.repository.read();
    const index = state.jobs.findIndex((item) => item.id === job.id);
    job.modified = new Date().toISOString();
    if (index === -1) state.jobs.push(job);
    else state.jobs[index] = structuredClone(job);
    const session = state.sessions.find((item) => item.id === job.sessionId);
    if (session) session.modified = job.modified;
    await this.repository.write(state);
  }

  private async requiredApi(id: string) {
    const state = await this.repository.read();
    const storedApi = state.apis.find((a) => a.id === id);
    const api = storedApi ?? builtinRunningHubApi(id, state.providers);
    if (!api) throw new AppError("CONTENT_API_NOT_FOUND", "Content generation API was not found", 404);
    const storedProvider = state.providers.find((p) => p.id === api.providerId);
    const provider = storedProvider ?? builtinRunningHubProviderById(api.providerId);
    if (!provider) throw new AppError("CONTENT_PROVIDER_NOT_FOUND", "Content provider was not found", 404);
    return {
      ...api,
      apiKey: api.credentialMode === "override" ? api.apiKey : provider.apiKey,
      commonHeaders: {
        ...(provider.commonHeaders ?? {}),
        ...(api.commonHeaders ?? {}),
      },
    };
  }

  private async requiredSession(id: string) {
    const session = await this.repository.getSession(id);
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Content generation session was not found", 404);
    return session;
  }

  private async requiredJob(id: string) {
    const job = await this.repository.getJob(id);
    if (!job) throw new AppError("CONTENT_JOB_NOT_FOUND", "Content generation job was not found", 404);
    return job;
  }
}

function publicApi(api: SaveContentGenerationApiRequest & { apiKey?: string }): ContentGenerationApi {
  const { apiKey, ...rest } = api;
  return { ...rest, hasApiKeyOverride: Boolean(apiKey) };
}

function publicProvider(
  provider: SaveContentGenerationProviderRequest & { apiKey?: string },
): PublicContentGenerationProvider {
  const { apiKey, ...rest } = provider;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

function validateJobInput(
  api: SaveContentGenerationApiRequest,
  prompt: string,
  parameters: Record<string, JsonValue>,
  files: ContentGenerationInputFile[],
) {
  const schema = api.inputSchema;
  if ((schema?.prompt.required ?? true) && !prompt.trim()) {
    throw new AppError("VALIDATION_ERROR", "Prompt is required", 400);
  }
  if (schema?.prompt.maxLength && prompt.length > schema.prompt.maxLength) {
    throw new AppError("VALIDATION_ERROR", `Prompt must not exceed ${schema.prompt.maxLength} characters`, 400);
  }
  if (schema) return validateSchemaInput(schema, parameters, files);
  if (api.requiresImages && !files.length) throw new AppError("VALIDATION_ERROR", "This content generation API requires an image", 400);
  if (!api.requiresImages && files.length) throw new AppError("VALIDATION_ERROR", "This content generation API does not accept images", 400);
  if (files.length && !api.upload) throw new AppError("VALIDATION_ERROR", "File upload is not configured", 400);
  if (api.upload?.maxFiles && files.length > api.upload.maxFiles) throw new AppError("VALIDATION_ERROR", `At most ${api.upload.maxFiles} files are allowed`, 400);
  for (const file of files) {
    if (api.upload?.acceptedTypes?.length && !api.upload.acceptedTypes.includes(file.mimeType)) throw new AppError("VALIDATION_ERROR", `Unsupported file type: ${file.mimeType}`, 400);
    if (api.upload?.maxFileSizeBytes && file.data.byteLength > api.upload.maxFileSizeBytes) throw new AppError("VALIDATION_ERROR", `File ${file.name} is too large`, 400);
  }
  return parameters;
}

function validateSchemaInput(
  schema: ContentGenerationInputSchema,
  parameters: Record<string, JsonValue>,
  files: ContentGenerationInputFile[],
) {
  const normalized: Record<string, JsonValue> = {};
  const fields = new Map((schema.parameters ?? []).map((field) => [field.key, field]));
  for (const key of Object.keys(parameters)) {
    if (!fields.has(key)) {
      throw new AppError("VALIDATION_ERROR", `Unknown generation parameter: ${key}`, 400);
    }
  }
  for (const field of fields.values()) {
    const value = parameters[field.key] ?? field.defaultValue;
    if (value === undefined || value === null || value === "") {
      if (field.required) {
        throw new AppError("VALIDATION_ERROR", `${field.label} is required`, 400);
      }
      continue;
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      throw new AppError("VALIDATION_ERROR", `${field.label} must be a boolean`, 400);
    }
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new AppError("VALIDATION_ERROR", `${field.label} must be a number`, 400);
      }
      if (field.min !== undefined && value < field.min) {
        throw new AppError("VALIDATION_ERROR", `${field.label} must be at least ${field.min}`, 400);
      }
      if (field.max !== undefined && value > field.max) {
        throw new AppError("VALIDATION_ERROR", `${field.label} must not exceed ${field.max}`, 400);
      }
    }
    if ((field.type === "text" || field.type === "select") && typeof value !== "string") {
      throw new AppError("VALIDATION_ERROR", `${field.label} must be text`, 400);
    }
    if (field.type === "multi-select" && !Array.isArray(value)) {
      throw new AppError("VALIDATION_ERROR", `${field.label} must be a list`, 400);
    }
    if (field.options?.length) {
      const allowed = field.options.map((option) => option.value);
      const selected = Array.isArray(value) ? value : [value];
      if (selected.some((item) => !allowed.includes(item as never))) {
        throw new AppError("VALIDATION_ERROR", `${field.label} contains an unsupported value`, 400);
      }
    }
    normalized[field.key] = structuredClone(value);
  }

  const slots = new Map((schema.assets ?? []).map((slot) => [slot.key, slot]));
  for (const file of files) {
    const slot = slots.get(file.slot);
    if (!slot) throw new AppError("VALIDATION_ERROR", `Unknown asset slot: ${file.slot}`, 400);
    if (slot.acceptedTypes?.length && !slot.acceptedTypes.includes(file.mimeType)) {
      throw new AppError("VALIDATION_ERROR", `Unsupported file type for ${slot.label}: ${file.mimeType}`, 400);
    }
    if (slot.maxFileSizeBytes && file.data.byteLength > slot.maxFileSizeBytes) {
      throw new AppError("VALIDATION_ERROR", `File ${file.name} is too large for ${slot.label}`, 400);
    }
  }
  for (const slot of slots.values()) {
    const count = files.filter((file) => file.slot === slot.key).length;
    const minimum = slot.minFiles ?? (slot.required ? 1 : 0);
    const maximum = slot.maxFiles ?? (slot.multiple ? undefined : 1);
    if (count < minimum) {
      throw new AppError("VALIDATION_ERROR", `${slot.label} requires at least ${minimum} file(s)`, 400);
    }
    if (maximum !== undefined && count > maximum) {
      throw new AppError("VALIDATION_ERROR", `${slot.label} accepts at most ${maximum} file(s)`, 400);
    }
  }
  return normalized;
}

function mediaTypeFromMime(mimeType: string): "image" | "video" | "audio" {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

function variablesFor(api: SaveContentGenerationApiRequest & { apiKey?: string }, job: ContentGenerationJob): Variables {
  const assetValues: Record<string, string | string[]> = {};
  for (const slot of api.inputSchema?.assets ?? []) {
    const urls = (job.uploadedAssets ?? [])
      .filter((asset) => asset.slot === slot.key)
      .map((asset) => asset.url);
    assetValues[slot.key] = slot.multiple ? urls : (urls[0] ?? "");
  }
  return {
    secret: { apiKey: api.apiKey ?? "" },
    input: {
      prompt: job.prompt,
      ...(job.parameters ?? {}),
      ...assetValues,
      images: job.uploadedUrls.map((url) => ({ url })),
    },
    upload: { urls: job.uploadedUrls },
    job: { remoteTaskId: job.remoteTaskId ?? "" },
  };
}

function renderHeaders(api: SaveContentGenerationApiRequest, local: Record<string, string> | undefined, variables: Variables) {
  const headers = { ...(api.commonHeaders ?? {}), ...(local ?? {}) };
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, renderString(value, variables)]));
}

function renderJson(value: JsonValue | undefined, variables: Variables): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const exact = /^\{\{([^}]+)\}\}$/.exec(value);
    if (exact) {
      const replacement = valueAt(variables, exact[1].trim());
      return replacement === undefined || replacement === ""
        ? undefined
        : cloneJson(replacement) as JsonValue;
    }
    return renderString(value, variables);
  }
  if (Array.isArray(value)) return value.map((item) => renderJson(item, variables) as JsonValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value).flatMap(([key, item]) => {
      const rendered = renderJson(item, variables);
      return rendered === undefined ? [] : [[key, rendered] as const];
    });
    return Object.fromEntries(entries) as Record<string, JsonValue>;
  }
  return value;
}

function renderString(value: string, variables: Variables) {
  return value.replace(/\{\{([^}]+)\}\}/g, (_match, pathValue: string) => {
    const replacement = valueAt(variables, pathValue.trim());
    return replacement === undefined || replacement === null ? "" : String(replacement);
  });
}

function valueAt(value: unknown, pathValue?: string): unknown {
  if (!pathValue) return value;
  return pathValue.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function stringAt(value: unknown, pathValue?: string) {
  const result = valueAt(value, pathValue);
  return typeof result === "string" || typeof result === "number" ? String(result) : "";
}

function cloneJson(value: unknown) {
  return value === undefined ? null : structuredClone(value);
}

const MAX_PROVIDER_RESPONSE_SIZE = 64 * 1024;
const SENSITIVE_RESPONSE_KEY = /api[-_]?key|authorization|token|secret|password/i;

function providerResponseSnapshot(value: unknown) {
  const body = sanitizeProviderResponse(value);
  const serialized = JSON.stringify(body);
  return {
    receivedAt: new Date().toISOString(),
    body: serialized.length <= MAX_PROVIDER_RESPONSE_SIZE
      ? body
      : {
          truncated: true,
          preview: serialized.slice(0, MAX_PROVIDER_RESPONSE_SIZE),
        },
  };
}

function sanitizeProviderResponse(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(sanitizeProviderResponse);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_RESPONSE_KEY.test(key) ? "[REDACTED]" : sanitizeProviderResponse(item),
      ]),
    );
  }
  return String(value ?? "");
}

function pendingPhase(status: string | undefined, pendingValues: string[]) {
  return status && pendingValues[0] === status ? "queued" as const : "running" as const;
}

function isActive(phase: ContentGenerationJob["phase"]) {
  return ["created", "uploading", "submitting", "queued", "running", "downloading"].includes(phase);
}

function extensionFromContentType(value?: string) {
  const type = value?.split(";", 1)[0];
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "video/mp4") return "mp4";
  if (type === "video/webm") return "webm";
  return undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Content generation failed";
}

// -- 内置 RunningHub 供应商与 API 解析 --

/** 返回内置 RunningHub 供应商（StoredContentGenerationProvider），不含已存储的 apiKey */
function builtinRunningHubProvider(): StoredContentGenerationProvider {
  return createBuiltinRunningHubProviderStored();
}

/** 按 providerId 匹配内置 RunningHub 供应商，非内置 ID 返回 null */
function builtinRunningHubProviderById(providerId: string): StoredContentGenerationProvider | null {
  if (providerId === BUILTIN_RUNNINGHUB_PROVIDER_ID) return builtinRunningHubProvider();
  return null;
}

/** 根据已存储的供应商列表，返回内置 RunningHub API 列表（providerId 指向已存储或内置供应商） */
function builtinRunningHubApis(
  storedProviders: StoredContentGenerationProvider[],
): StoredContentGenerationApi[] {
  const storedRunninghub = storedProviders.find((p) => p.type === "runninghub");
  const providerId = storedRunninghub?.id ?? BUILTIN_RUNNINGHUB_PROVIDER_ID;
  return createBuiltinRunningHubApisStored(providerId);
}

/** 按 id 匹配内置 RunningHub API，非内置 ID 返回 null */
function builtinRunningHubApi(
  id: string,
  storedProviders: StoredContentGenerationProvider[],
): StoredContentGenerationApi | null {
  const builtinApis = builtinRunningHubApis(storedProviders);
  return builtinApis.find((api) => api.id === id) ?? null;
}
