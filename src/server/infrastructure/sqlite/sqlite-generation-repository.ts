import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
import type {
  GenerationArtifact,
  GenerationCapability,
  GenerationInput,
  GenerationRoute,
  GenerationRun,
  GenerationRunStatus,
  GenerationSession,
  ProviderJob,
  ProviderJobStatus,
} from "@/server/domain/generation";
import type {
  CreateGenerationRunResult,
  CreateGenerationRetryResult,
  GenerationRepository,
} from "@/server/ports/generation-repository";
import { SqliteDatabase } from "./sqlite-database";

type SqliteRow = Record<string, SQLOutputValue>;

export class SqliteGenerationRepository implements GenerationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async upsertSession(session: GenerationSession): Promise<void> {
    this.database.prepare(`
      INSERT INTO sessions(
        id, cwd, title, origin, agent_session_ref, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        cwd = excluded.cwd,
        title = excluded.title,
        origin = excluded.origin,
        agent_session_ref = excluded.agent_session_ref,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `).run(
      session.id,
      session.cwd,
      session.title ?? null,
      session.origin,
      session.agentSessionRef ?? null,
      session.createdAt,
      session.updatedAt,
      session.deletedAt ?? null,
    );
  }

  async getSession(id: string): Promise<GenerationSession | null> {
    const row = this.database
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id);
    return row ? sessionFromRow(row) : null;
  }

  async upsertRoute(route: GenerationRoute): Promise<void> {
    this.database.transaction(() => {
      if (route.enabled && route.isDefault) {
        this.database.prepare(`
          UPDATE generation_routes
          SET is_default = 0, updated_at = ?
          WHERE capability = ? AND id <> ? AND is_default = 1
        `).run(route.updatedAt, route.capability, route.id);
      }
      this.database.prepare(`
        INSERT INTO generation_routes(
          id, name, capability, provider_id, provider_operation,
          enabled, is_default, revision, defaults_json, adapter_config_json,
          credential_ref, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          capability = excluded.capability,
          provider_id = excluded.provider_id,
          provider_operation = excluded.provider_operation,
          enabled = excluded.enabled,
          is_default = excluded.is_default,
          revision = excluded.revision,
          defaults_json = excluded.defaults_json,
          adapter_config_json = excluded.adapter_config_json,
          credential_ref = excluded.credential_ref,
          updated_at = excluded.updated_at
      `).run(
        route.id,
        route.name,
        route.capability,
        route.providerId,
        route.providerOperation,
        route.enabled ? 1 : 0,
        route.isDefault ? 1 : 0,
        route.revision,
        JSON.stringify(route.defaults),
        JSON.stringify(route.adapterConfig),
        route.credentialRef ?? null,
        route.createdAt,
        route.updatedAt,
      );
    });
  }

  async getRoute(id: string): Promise<GenerationRoute | null> {
    const row = this.database
      .prepare("SELECT * FROM generation_routes WHERE id = ?")
      .get(id);
    return row ? routeFromRow(row) : null;
  }

  async findDefaultRoute(
    capability: GenerationCapability,
  ): Promise<GenerationRoute | null> {
    const row = this.database.prepare(`
      SELECT * FROM generation_routes
      WHERE capability = ? AND enabled = 1 AND is_default = 1
      LIMIT 1
    `).get(capability);
    return row ? routeFromRow(row) : null;
  }

  async listRoutes(): Promise<GenerationRoute[]> {
    return this.database
      .prepare("SELECT * FROM generation_routes ORDER BY name, id")
      .all()
      .map(routeFromRow);
  }

  async createRun(
    run: GenerationRun,
    job: ProviderJob,
  ): Promise<CreateGenerationRunResult> {
    return this.database.transaction(() => {
      const existingRow = this.database
        .prepare("SELECT * FROM generation_runs WHERE idempotency_key = ?")
        .get(run.idempotencyKey);
      if (existingRow) {
        const existingRun = runFromRow(existingRow);
        const existingJobRow = this.database.prepare(`
          SELECT * FROM provider_jobs
          WHERE run_id = ?
          ORDER BY attempt
          LIMIT 1
        `).get(existingRun.id);
        if (!existingJobRow) {
          throw new Error(`Generation run ${existingRun.id} has no provider job`);
        }
        return {
          created: false,
          run: existingRun,
          job: jobFromRow(existingJobRow),
        };
      }

      this.insertRun(run);
      this.insertJob(job);
      return { created: true, run, job };
    });
  }

  async createRetryJob(
    run: GenerationRun,
    job: ProviderJob,
  ): Promise<CreateGenerationRetryResult | null> {
    return this.database.transaction(() => {
      if (!job.retryKey) throw new Error("Retry job requires an idempotency key");
      const existingRow = this.database
        .prepare("SELECT * FROM provider_jobs WHERE retry_key = ?")
        .get(job.retryKey);
      if (existingRow) {
        const existingJob = jobFromRow(existingRow);
        const existingRunRow = this.database
          .prepare("SELECT * FROM generation_runs WHERE id = ?")
          .get(existingJob.runId);
        if (!existingRunRow) throw new Error(`Generation run ${existingJob.runId} was not found`);
        return { created: false, run: runFromRow(existingRunRow), job: existingJob };
      }
      if (!this.updateRun(run, ["failed", "cancelled"])) return null;
      this.insertJob(job);
      return { created: true, run, job };
    });
  }

  async getRun(id: string): Promise<GenerationRun | null> {
    const row = this.database
      .prepare("SELECT * FROM generation_runs WHERE id = ?")
      .get(id);
    return row ? runFromRow(row) : null;
  }

  async listRunsBySession(sessionId: string): Promise<GenerationRun[]> {
    return this.database.prepare(`
      SELECT * FROM generation_runs
      WHERE session_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(sessionId).map(runFromRow);
  }

  async updateRun(
    run: GenerationRun,
    expectedStatuses?: GenerationRunStatus[],
  ): Promise<boolean> {
    const expected = expectedStatuses?.length ? expectedStatuses : null;
    const where = expected
      ? ` AND status IN (${expected.map(() => "?").join(", ")})`
      : "";
    const values: SQLInputValue[] = [
      run.sessionId,
      run.capability,
      run.routeId,
      run.parentRunId ?? null,
      run.status,
      run.prompt,
      JSON.stringify(run.input),
      run.source,
      run.sourceRef ?? null,
      run.errorCode ?? null,
      run.errorMessage ?? null,
      run.updatedAt,
      run.completedAt ?? null,
      run.id,
      ...(expected ?? []),
    ];
    const result = this.database.prepare(`
      UPDATE generation_runs SET
        session_id = ?, capability = ?, route_id = ?, parent_run_id = ?,
        status = ?, prompt = ?, input_json = ?, source = ?, source_ref = ?,
        error_code = ?, error_message = ?, updated_at = ?, completed_at = ?
      WHERE id = ?${where}
    `).run(...values);
    return result.changes === 1;
  }

  async getJob(id: string): Promise<ProviderJob | null> {
    const row = this.database
      .prepare("SELECT * FROM provider_jobs WHERE id = ?")
      .get(id);
    return row ? jobFromRow(row) : null;
  }

  async listJobsByRun(runId: string): Promise<ProviderJob[]> {
    return this.database.prepare(`
      SELECT * FROM provider_jobs
      WHERE run_id = ?
      ORDER BY attempt, id
    `).all(runId).map(jobFromRow);
  }

  async updateJob(
    job: ProviderJob,
    expectedStatuses?: ProviderJobStatus[],
  ): Promise<boolean> {
    const expected = expectedStatuses?.length ? expectedStatuses : null;
    const where = expected
      ? ` AND status IN (${expected.map(() => "?").join(", ")})`
      : "";
    const values: SQLInputValue[] = [
      job.runId,
      job.attempt,
      job.providerId,
      job.providerOperation,
      job.routeRevision,
      JSON.stringify(job.resolvedConfigSnapshot),
      job.credentialRef ?? null,
      job.retryKey ?? null,
      job.preparedAssets ? JSON.stringify(job.preparedAssets) : null,
      job.status,
      job.remoteTaskId ?? null,
      job.remoteStatus ?? null,
      job.nextPollAt ?? null,
      job.leaseOwner ?? null,
      job.leaseExpiresAt ?? null,
      job.lastErrorCode ?? null,
      job.lastErrorMessage ?? null,
      job.updatedAt,
      job.id,
      ...(expected ?? []),
    ];
    const result = this.database.prepare(`
      UPDATE provider_jobs SET
        run_id = ?, attempt = ?, provider_id = ?, provider_operation = ?,
        route_revision = ?, resolved_config_json = ?, credential_ref = ?,
        retry_key = ?, prepared_assets_json = ?, status = ?,
        remote_task_id = ?, remote_status = ?, next_poll_at = ?,
        lease_owner = ?, lease_expires_at = ?, last_error_code = ?,
        last_error_message = ?, updated_at = ?
      WHERE id = ?${where}
    `).run(...values);
    return result.changes === 1;
  }

  async claimDueJobs(input: {
    owner: string;
    now: string;
    leaseExpiresAt: string;
    limit: number;
  }): Promise<ProviderJob[]> {
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit)));
    return this.database.transaction(() => {
      const rows = this.database.prepare(`
        SELECT * FROM provider_jobs
        WHERE status IN ('created', 'uploading', 'submitted', 'polling', 'downloading')
          AND (next_poll_at IS NULL OR next_poll_at <= ?)
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        ORDER BY COALESCE(next_poll_at, created_at), created_at, id
        LIMIT ?
      `).all(input.now, input.now, limit);
      const update = this.database.prepare(`
        UPDATE provider_jobs
        SET lease_owner = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      `);
      const claimed: ProviderJob[] = [];
      for (const row of rows) {
        const id = requiredString(row, "id");
        const result = update.run(
          input.owner,
          input.leaseExpiresAt,
          input.now,
          id,
          input.now,
        );
        if (result.changes !== 1) continue;
        claimed.push(jobFromRow({
          ...row,
          lease_owner: input.owner,
          lease_expires_at: input.leaseExpiresAt,
          updated_at: input.now,
        }));
      }
      return claimed;
    });
  }

  async listExpiredJobsByStatus(input: {
    status: ProviderJobStatus;
    now: string;
  }): Promise<ProviderJob[]> {
    return this.database.prepare(`
      SELECT * FROM provider_jobs
      WHERE status = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      ORDER BY created_at, id
    `).all(input.status, input.now).map(jobFromRow);
  }

  async getArtifact(id: string): Promise<GenerationArtifact | null> {
    const row = this.database
      .prepare("SELECT * FROM generation_artifacts WHERE id = ?")
      .get(id);
    return row ? artifactFromRow(row) : null;
  }

  async addArtifacts(artifacts: GenerationArtifact[]): Promise<void> {
    if (!artifacts.length) return;
    const insert = this.database.prepare(`
      INSERT INTO generation_artifacts(
        id, run_id, job_id, kind, local_path, remote_url,
        content_type, size_bytes, checksum, text_value, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    this.database.transaction(() => {
      for (const artifact of artifacts) {
        insert.run(
          artifact.id,
          artifact.runId,
          artifact.jobId,
          artifact.kind,
          artifact.localPath ?? null,
          artifact.remoteUrl ?? null,
          artifact.contentType ?? null,
          artifact.sizeBytes ?? null,
          artifact.checksum ?? null,
          artifact.text ?? null,
          artifact.createdAt,
        );
      }
    });
  }

  async listArtifactsByRun(runId: string): Promise<GenerationArtifact[]> {
    return this.database.prepare(`
      SELECT * FROM generation_artifacts
      WHERE run_id = ?
      ORDER BY created_at, id
    `).all(runId).map(artifactFromRow);
  }

  private insertRun(run: GenerationRun): void {
    this.database.prepare(`
      INSERT INTO generation_runs(
        id, session_id, capability, route_id, parent_run_id, status,
        prompt, input_json, source, source_ref, idempotency_key,
        error_code, error_message, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.sessionId,
      run.capability,
      run.routeId,
      run.parentRunId ?? null,
      run.status,
      run.prompt,
      JSON.stringify(run.input),
      run.source,
      run.sourceRef ?? null,
      run.idempotencyKey,
      run.errorCode ?? null,
      run.errorMessage ?? null,
      run.createdAt,
      run.updatedAt,
      run.completedAt ?? null,
    );
  }

  private insertJob(job: ProviderJob): void {
    this.database.prepare(`
      INSERT INTO provider_jobs(
        id, run_id, attempt, provider_id, provider_operation, route_revision,
        resolved_config_json, credential_ref, retry_key, prepared_assets_json, status,
        remote_task_id, remote_status,
        next_poll_at, lease_owner, lease_expires_at, last_error_code,
        last_error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.runId,
      job.attempt,
      job.providerId,
      job.providerOperation,
      job.routeRevision,
      JSON.stringify(job.resolvedConfigSnapshot),
      job.credentialRef ?? null,
      job.retryKey ?? null,
      job.preparedAssets ? JSON.stringify(job.preparedAssets) : null,
      job.status,
      job.remoteTaskId ?? null,
      job.remoteStatus ?? null,
      job.nextPollAt ?? null,
      job.leaseOwner ?? null,
      job.leaseExpiresAt ?? null,
      job.lastErrorCode ?? null,
      job.lastErrorMessage ?? null,
      job.createdAt,
      job.updatedAt,
    );
  }
}

function sessionFromRow(row: SqliteRow): GenerationSession {
  return {
    id: requiredString(row, "id"),
    cwd: requiredString(row, "cwd"),
    title: optionalString(row, "title"),
    origin: requiredString(row, "origin") as GenerationSession["origin"],
    agentSessionRef: optionalString(row, "agent_session_ref"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
    deletedAt: optionalString(row, "deleted_at"),
  };
}

function routeFromRow(row: SqliteRow): GenerationRoute {
  return {
    id: requiredString(row, "id"),
    name: requiredString(row, "name"),
    capability: requiredString(row, "capability") as GenerationCapability,
    providerId: requiredString(row, "provider_id"),
    providerOperation: requiredString(row, "provider_operation"),
    enabled: requiredNumber(row, "enabled") === 1,
    isDefault: requiredNumber(row, "is_default") === 1,
    revision: requiredNumber(row, "revision"),
    defaults: parseJson<GenerationRoute["defaults"]>(row, "defaults_json"),
    adapterConfig: parseJson<GenerationRoute["adapterConfig"]>(
      row,
      "adapter_config_json",
    ),
    credentialRef: optionalString(row, "credential_ref"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
  };
}

function runFromRow(row: SqliteRow): GenerationRun {
  return {
    id: requiredString(row, "id"),
    sessionId: requiredString(row, "session_id"),
    capability: requiredString(row, "capability") as GenerationCapability,
    routeId: requiredString(row, "route_id"),
    parentRunId: optionalString(row, "parent_run_id"),
    status: requiredString(row, "status") as GenerationRunStatus,
    prompt: requiredString(row, "prompt"),
    input: parseJson<GenerationInput>(row, "input_json"),
    source: requiredString(row, "source") as GenerationRun["source"],
    sourceRef: optionalString(row, "source_ref"),
    idempotencyKey: requiredString(row, "idempotency_key"),
    errorCode: optionalString(row, "error_code"),
    errorMessage: optionalString(row, "error_message"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
    completedAt: optionalString(row, "completed_at"),
  };
}

function jobFromRow(row: SqliteRow): ProviderJob {
  return {
    id: requiredString(row, "id"),
    runId: requiredString(row, "run_id"),
    attempt: requiredNumber(row, "attempt"),
    providerId: requiredString(row, "provider_id"),
    providerOperation: requiredString(row, "provider_operation"),
    routeRevision: requiredNumber(row, "route_revision"),
    resolvedConfigSnapshot: parseJson<ProviderJob["resolvedConfigSnapshot"]>(
      row,
      "resolved_config_json",
    ),
    credentialRef: optionalString(row, "credential_ref"),
    retryKey: optionalString(row, "retry_key"),
    preparedAssets: optionalJson<ProviderJob["preparedAssets"]>(
      row,
      "prepared_assets_json",
    ),
    status: requiredString(row, "status") as ProviderJobStatus,
    remoteTaskId: optionalString(row, "remote_task_id"),
    remoteStatus: optionalString(row, "remote_status"),
    nextPollAt: optionalString(row, "next_poll_at"),
    leaseOwner: optionalString(row, "lease_owner"),
    leaseExpiresAt: optionalString(row, "lease_expires_at"),
    lastErrorCode: optionalString(row, "last_error_code"),
    lastErrorMessage: optionalString(row, "last_error_message"),
    createdAt: requiredString(row, "created_at"),
    updatedAt: requiredString(row, "updated_at"),
  };
}

function artifactFromRow(row: SqliteRow): GenerationArtifact {
  return {
    id: requiredString(row, "id"),
    runId: requiredString(row, "run_id"),
    jobId: requiredString(row, "job_id"),
    kind: requiredString(row, "kind") as GenerationArtifact["kind"],
    localPath: optionalString(row, "local_path"),
    remoteUrl: optionalString(row, "remote_url"),
    contentType: optionalString(row, "content_type"),
    sizeBytes: optionalNumber(row, "size_bytes"),
    checksum: optionalString(row, "checksum"),
    text: optionalString(row, "text_value"),
    createdAt: requiredString(row, "created_at"),
  };
}

function requiredString(row: SqliteRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Expected ${key} to be text`);
  return value;
}

function optionalString(row: SqliteRow, key: string): string | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Expected ${key} to be text`);
  return value;
}

function requiredNumber(row: SqliteRow, key: string): number {
  const value = row[key];
  if (typeof value !== "number") throw new Error(`Expected ${key} to be numeric`);
  return value;
}

function optionalNumber(row: SqliteRow, key: string): number | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "number") throw new Error(`Expected ${key} to be numeric`);
  return value;
}

function parseJson<T>(row: SqliteRow, key: string): T {
  return JSON.parse(requiredString(row, key)) as T;
}

function optionalJson<T>(row: SqliteRow, key: string): T | undefined {
  const value = optionalString(row, key);
  return value === undefined ? undefined : JSON.parse(value) as T;
}
