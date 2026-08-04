import { randomUUID } from "node:crypto";
import type {
  ContentGenerationApi,
  ContentGenerationJob,
  ContentGenerationOutput,
  ContentGenerationSession,
  JsonValue,
  SaveContentGenerationApiRequest,
} from "@/contracts/content-generation";
import type { SessionInfo } from "@/contracts/sessions";
import type { ContentGenerationInputFile } from "@/server/domain/content-generation";
import { AppError } from "@/server/domain/app-error";
import type { ContentGenerationProvider, ContentGenerationArtifactStore } from "@/server/ports/content-generation-provider";
import type { ContentGenerationRepository } from "@/server/ports/content-generation-repository";
import type { WorkspaceRootProvider } from "@/server/ports/file-system";
import { resolveAllowedCwd } from "./resolve-allowed-cwd";

type Variables = Record<string, unknown>;

export class ContentGenerationService {
  constructor(
    private readonly repository: ContentGenerationRepository,
    private readonly provider: ContentGenerationProvider,
    private readonly artifacts: ContentGenerationArtifactStore,
    private readonly roots: WorkspaceRootProvider,
  ) {}

  async listApis(): Promise<ContentGenerationApi[]> {
    return (await this.repository.read()).apis.map(publicApi);
  }

  async saveApi(input: SaveContentGenerationApiRequest) {
    const state = await this.repository.read();
    const existing = state.apis.find((api) => api.id === input.id);
    const api = {
      ...input,
      apiKey: input.apiKey?.trim() || existing?.apiKey,
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
    files: ContentGenerationInputFile[];
  }) {
    const session = await this.requiredSession(input.sessionId);
    const api = await this.requiredApi(session.apiId);
    validateJobInput(api, input.prompt, input.files);
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
      uploadedUrls: [],
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
        job.uploadedUrls = await this.uploadFiles(api, input.files);
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
    if (!isActive(job.phase)) return job;
    const session = await this.requiredSession(job.sessionId);
    const api = await this.requiredApi(job.apiId);
    if (api.completion.mode !== "polling" || !job.remoteTaskId) return job;
    if (Date.now() - new Date(job.created).getTime() > api.completion.timeoutMs) {
      return this.failJob(
        job,
        "query",
        new Error("Content generation timed out"),
      );
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
    const urls: string[] = [];
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
      urls.push(url);
    }
    return urls;
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
    const api = await this.repository.getApi(id);
    if (!api) throw new AppError("CONTENT_API_NOT_FOUND", "Content generation API was not found", 404);
    return api;
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
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

function validateJobInput(api: SaveContentGenerationApiRequest, prompt: string, files: ContentGenerationInputFile[]) {
  if (!prompt.trim()) throw new AppError("VALIDATION_ERROR", "Prompt is required", 400);
  if (api.requiresImages && !files.length) throw new AppError("VALIDATION_ERROR", "This content generation API requires an image", 400);
  if (!api.requiresImages && files.length) throw new AppError("VALIDATION_ERROR", "This content generation API does not accept images", 400);
  if (files.length && !api.upload) throw new AppError("VALIDATION_ERROR", "File upload is not configured", 400);
  if (api.upload?.maxFiles && files.length > api.upload.maxFiles) throw new AppError("VALIDATION_ERROR", `At most ${api.upload.maxFiles} files are allowed`, 400);
  for (const file of files) {
    if (api.upload?.acceptedTypes?.length && !api.upload.acceptedTypes.includes(file.mimeType)) throw new AppError("VALIDATION_ERROR", `Unsupported file type: ${file.mimeType}`, 400);
    if (api.upload?.maxFileSizeBytes && file.data.byteLength > api.upload.maxFileSizeBytes) throw new AppError("VALIDATION_ERROR", `File ${file.name} is too large`, 400);
  }
}

function variablesFor(api: SaveContentGenerationApiRequest & { apiKey?: string }, job: ContentGenerationJob): Variables {
  return {
    secret: { apiKey: api.apiKey ?? "" },
    input: {
      prompt: job.prompt,
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
    if (exact) return cloneJson(valueAt(variables, exact[1].trim())) as JsonValue;
    return renderString(value, variables);
  }
  if (Array.isArray(value)) return value.map((item) => renderJson(item, variables) as JsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        renderJson(item, variables) as JsonValue,
      ]),
    ) as Record<string, JsonValue>;
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
