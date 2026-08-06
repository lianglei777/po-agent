export interface SqliteMigration {
  version: number;
  name: string;
  sql: string;
}

export const SQLITE_MIGRATIONS: SqliteMigration[] = [
  {
    version: 1,
    name: "initial_generation_schema",
    sql: `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        title TEXT,
        origin TEXT NOT NULL CHECK (origin IN ('chat', 'direct-generation', 'imported')),
        agent_session_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      ) STRICT;

      CREATE UNIQUE INDEX sessions_agent_session_ref_unique
        ON sessions(agent_session_ref)
        WHERE agent_session_ref IS NOT NULL;

      CREATE TABLE generation_routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        capability TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_operation TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
        revision INTEGER NOT NULL CHECK (revision > 0),
        defaults_json TEXT NOT NULL,
        adapter_config_json TEXT NOT NULL,
        credential_ref TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE UNIQUE INDEX generation_routes_default_capability_unique
        ON generation_routes(capability)
        WHERE enabled = 1 AND is_default = 1;

      CREATE TABLE generation_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        capability TEXT NOT NULL,
        route_id TEXT NOT NULL REFERENCES generation_routes(id),
        parent_run_id TEXT REFERENCES generation_runs(id),
        status TEXT NOT NULL,
        prompt TEXT NOT NULL,
        input_json TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('agent-tool', 'direct-ui', 'api')),
        source_ref TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;

      CREATE INDEX generation_runs_session_created_idx
        ON generation_runs(session_id, created_at DESC);

      CREATE TABLE provider_jobs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES generation_runs(id),
        attempt INTEGER NOT NULL CHECK (attempt > 0),
        provider_id TEXT NOT NULL,
        provider_operation TEXT NOT NULL,
        route_revision INTEGER NOT NULL CHECK (route_revision > 0),
        resolved_config_json TEXT NOT NULL,
        credential_ref TEXT,
        prepared_assets_json TEXT,
        status TEXT NOT NULL,
        remote_task_id TEXT,
        remote_status TEXT,
        next_poll_at TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (run_id, attempt)
      ) STRICT;

      CREATE INDEX provider_jobs_due_idx
        ON provider_jobs(status, next_poll_at, lease_expires_at);

      CREATE TABLE generation_artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES generation_runs(id),
        job_id TEXT NOT NULL REFERENCES provider_jobs(id),
        kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'text')),
        local_path TEXT,
        remote_url TEXT,
        content_type TEXT,
        size_bytes INTEGER,
        checksum TEXT,
        text_value TEXT,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX generation_artifacts_run_idx
        ON generation_artifacts(run_id, created_at);
    `,
  },
  {
    version: 2,
    name: "generation_retry_idempotency",
    sql: `
      ALTER TABLE provider_jobs ADD COLUMN retry_key TEXT;
      CREATE UNIQUE INDEX provider_jobs_retry_key_unique
        ON provider_jobs(retry_key)
        WHERE retry_key IS NOT NULL;
    `,
  },
  {
    version: 3,
    name: "generation_route_input_schema",
    sql: `
      ALTER TABLE generation_routes
        ADD COLUMN input_schema_json TEXT NOT NULL
        DEFAULT '{"prompt":{"required":true}}';
    `,
  },
  {
    version: 4,
    name: "generation_paid_capability_settings",
    sql: `
      CREATE TABLE generation_provider_settings (
        provider_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO generation_provider_settings(provider_id, enabled, updated_at)
      VALUES ('runninghub', 0, CURRENT_TIMESTAMP);
    `,
  },
];
