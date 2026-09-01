export interface SqliteMigration {
  version: number;
  name: string;
  sql: string;
  disableForeignKeys?: boolean;
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
  {
    version: 5,
    name: "generation_route_product",
    sql: `
      ALTER TABLE generation_routes
        ADD COLUMN product TEXT NOT NULL
        DEFAULT '';
    `,
  },
  {
    version: 6,
    name: "generation_provider_audit_snapshots",
    sql: `
      ALTER TABLE provider_jobs ADD COLUMN request_snapshot_json TEXT;
      ALTER TABLE provider_jobs ADD COLUMN response_snapshot_json TEXT;
    `,
  },
  {
    version: 7,
    name: "generation_run_chat_workflow_source",
    // SQLite 不能直接修改 CHECK 约束；关闭外键后原位重建父表，并在迁移后统一校验引用完整性。
    disableForeignKeys: true,
    sql: `
      CREATE TABLE generation_runs_v7 (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        capability TEXT NOT NULL,
        route_id TEXT NOT NULL REFERENCES generation_routes(id),
        parent_run_id TEXT REFERENCES generation_runs_v7(id),
        status TEXT NOT NULL,
        prompt TEXT NOT NULL,
        input_json TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('agent-tool', 'chat-workflow', 'direct-ui', 'api')),
        source_ref TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;

      INSERT INTO generation_runs_v7(
        id, session_id, capability, route_id, parent_run_id, status, prompt,
        input_json, source, source_ref, idempotency_key, error_code,
        error_message, created_at, updated_at, completed_at
      )
      SELECT
        id, session_id, capability, route_id, parent_run_id, status, prompt,
        input_json, source, source_ref, idempotency_key, error_code,
        error_message, created_at, updated_at, completed_at
      FROM generation_runs;

      DROP TABLE generation_runs;
      ALTER TABLE generation_runs_v7 RENAME TO generation_runs;
      CREATE INDEX generation_runs_session_created_idx
        ON generation_runs(session_id, created_at DESC);
    `,
  },
  {
    version: 8,
    name: "pipeline_tables",
    sql: `
      CREATE TABLE pipeline_projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        original_text TEXT NOT NULL,
        art_direction_json TEXT,
        model_settings_json TEXT,
        prompt_config_json TEXT,
        status TEXT NOT NULL,
        cover_artifact_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pipeline_projects_workspace_idx
        ON pipeline_projects(workspace_id, updated_at DESC);
      CREATE TABLE pipeline_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('character', 'scene', 'prop')),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        attributes_json TEXT,
        selected_artifact_id TEXT,
        locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
        starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pipeline_assets_project_type_idx
        ON pipeline_assets(project_id, type);
      CREATE TABLE pipeline_asset_variants (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES pipeline_assets(id) ON DELETE CASCADE,
        artifact_id TEXT,
        run_id TEXT,
        prompt TEXT NOT NULL,
        is_favorited INTEGER NOT NULL DEFAULT 0 CHECK (is_favorited IN (0, 1)),
        is_uploaded_source INTEGER NOT NULL DEFAULT 0 CHECK (is_uploaded_source IN (0, 1)),
        upload_type TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pipeline_asset_variants_asset_idx
        ON pipeline_asset_variants(asset_id, created_at DESC);
      CREATE TABLE pipeline_frames (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        scene_id TEXT,
        character_ids_json TEXT NOT NULL DEFAULT '[]',
        prop_ids_json TEXT NOT NULL DEFAULT '[]',
        frame_index INTEGER NOT NULL,
        visual_description TEXT,
        dialogue_structured_json TEXT,
        camera_movement_json TEXT,
        blocking_json TEXT,
        lighting_json TEXT,
        audio_note_json TEXT,
        shot_size TEXT,
        transition_hint TEXT,
        image_prompt TEXT,
        video_prompt TEXT,
        selected_image_artifact_id TEXT,
        final_take_run_id TEXT,
        locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pipeline_frames_project_index_idx
        ON pipeline_frames(project_id, frame_index);
      CREATE TABLE pipeline_canvas_nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('script', 'character', 'scene', 'prop', 'storyboard', 'video')),
        entity_id TEXT NOT NULL,
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pipeline_canvas_nodes_project_idx
        ON pipeline_canvas_nodes(project_id, type);
      CREATE UNIQUE INDEX pipeline_canvas_nodes_entity_unique
        ON pipeline_canvas_nodes(project_id, type, entity_id);
      CREATE TABLE pipeline_canvas_edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        source_node_id TEXT NOT NULL REFERENCES pipeline_canvas_nodes(id) ON DELETE CASCADE,
        target_node_id TEXT NOT NULL REFERENCES pipeline_canvas_nodes(id) ON DELETE CASCADE,
        edge_type TEXT NOT NULL CHECK (edge_type IN ('references', 'source_of', 'generates', 'derives_from'))
      ) STRICT;
      CREATE INDEX pipeline_canvas_edges_project_idx
        ON pipeline_canvas_edges(project_id);
      CREATE INDEX pipeline_canvas_edges_source_idx
        ON pipeline_canvas_edges(source_node_id);
      CREATE INDEX pipeline_canvas_edges_target_idx
        ON pipeline_canvas_edges(target_node_id);
    `,
  },

  {
    version: 9,
    name: "pipeline_media_canvas",
    // 旧表的 CHECK 约束无法 ALTER；重建节点/边，同时保留已有 Pipeline 数据。
    disableForeignKeys: true,
    sql: `
      CREATE TABLE pipeline_canvas_nodes_v9 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'audio', 'script', 'character', 'scene', 'prop', 'storyboard')),
        entity_id TEXT NOT NULL,
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        width REAL,
        height REAL,
        data_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO pipeline_canvas_nodes_v9(
        id, project_id, type, entity_id, position_x, position_y, width, height, data_json, created_at, updated_at
      )
      SELECT id, project_id, type, entity_id, position_x, position_y, NULL, NULL, NULL, created_at, created_at
      FROM pipeline_canvas_nodes;

      CREATE TABLE pipeline_canvas_edges_v9 (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        source_node_id TEXT NOT NULL REFERENCES pipeline_canvas_nodes_v9(id) ON DELETE CASCADE,
        target_node_id TEXT NOT NULL REFERENCES pipeline_canvas_nodes_v9(id) ON DELETE CASCADE,
        edge_type TEXT NOT NULL CHECK (edge_type IN ('references', 'source_of', 'generates', 'derives_from')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO pipeline_canvas_edges_v9(
        id, project_id, source_node_id, target_node_id, edge_type, created_at, updated_at
      )
      SELECT id, project_id, source_node_id, target_node_id, edge_type, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM pipeline_canvas_edges;

      DROP TABLE pipeline_canvas_edges;
      DROP TABLE pipeline_canvas_nodes;
      ALTER TABLE pipeline_canvas_nodes_v9 RENAME TO pipeline_canvas_nodes;
      ALTER TABLE pipeline_canvas_edges_v9 RENAME TO pipeline_canvas_edges;

      CREATE INDEX pipeline_canvas_nodes_project_idx
        ON pipeline_canvas_nodes(project_id, type);
      CREATE UNIQUE INDEX pipeline_canvas_nodes_entity_unique
        ON pipeline_canvas_nodes(project_id, type, entity_id);
      CREATE INDEX pipeline_canvas_edges_project_idx
        ON pipeline_canvas_edges(project_id);
      CREATE INDEX pipeline_canvas_edges_source_idx
        ON pipeline_canvas_edges(source_node_id);
      CREATE INDEX pipeline_canvas_edges_target_idx
        ON pipeline_canvas_edges(target_node_id);

      CREATE TABLE pipeline_canvas_drafts (
        project_id TEXT PRIMARY KEY REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        viewport_x REAL NOT NULL DEFAULT 0,
        viewport_y REAL NOT NULL DEFAULT 0,
        viewport_zoom REAL NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE pipeline_canvas_workflows (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        template_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pipeline_canvas_workflows_project_idx
        ON pipeline_canvas_workflows(project_id, updated_at DESC);
    `,
  },
  {
    version: 10,
    name: "pipeline_canvas_revision",
    sql: `
      ALTER TABLE pipeline_canvas_drafts
      ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 11,
    name: "pipeline_canvas_edge_bindings",
    sql: `
      ALTER TABLE pipeline_canvas_edges
      ADD COLUMN role TEXT NOT NULL DEFAULT 'reference'
        CHECK (role IN ('reference', 'first-frame', 'last-frame'));
      ALTER TABLE pipeline_canvas_edges
      ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0);
    `,
  },
  {
    version: 12,
    name: "generation_route_presentation",
    sql: `
      ALTER TABLE generation_routes
      ADD COLUMN description TEXT NOT NULL DEFAULT '';
      ALTER TABLE generation_routes
      ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
    `,
  },
  {
    version: 13,
    name: "generation_transient_failure_count",
    sql: `
      ALTER TABLE provider_jobs
      ADD COLUMN transient_failure_count INTEGER NOT NULL DEFAULT 0
        CHECK (transient_failure_count >= 0);
    `,
  },
  {
    version: 14,
    name: "generation_route_catalog_lifecycle",
    sql: `
      ALTER TABLE generation_routes
      ADD COLUMN navigation_label TEXT NOT NULL DEFAULT '';
      ALTER TABLE generation_routes
      ADD COLUMN retired_at TEXT;
      CREATE INDEX generation_routes_active_provider_idx
        ON generation_routes(provider_id, retired_at, name, id);
    `,
  },
  {
    version: 15,
    name: "pipeline_canvas_workflow_runs",
    sql: `
      CREATE TABLE pipeline_canvas_workflow_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelling', 'cancelled')),
        node_ids_json TEXT NOT NULL,
        edges_json TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;
      CREATE INDEX pipeline_canvas_workflow_runs_project_idx
        ON pipeline_canvas_workflow_runs(project_id, created_at DESC);
      CREATE INDEX pipeline_canvas_workflow_runs_active_idx
        ON pipeline_canvas_workflow_runs(project_id, status, updated_at DESC);

      CREATE TABLE pipeline_canvas_workflow_run_steps (
        workflow_run_id TEXT NOT NULL REFERENCES pipeline_canvas_workflow_runs(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        generation_run_id TEXT,
        error_message TEXT,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workflow_run_id, node_id)
      ) STRICT;
      CREATE INDEX pipeline_canvas_workflow_run_steps_generation_idx
        ON pipeline_canvas_workflow_run_steps(generation_run_id)
        WHERE generation_run_id IS NOT NULL;
    `,
  },
  {
    version: 16,
    name: "pipeline_canvas_single_active_workflow_run",
    sql: `
      CREATE UNIQUE INDEX pipeline_canvas_workflow_runs_one_active_per_project
        ON pipeline_canvas_workflow_runs(project_id)
        WHERE status IN ('pending', 'running', 'cancelling');
    `,
  },
  {
    version: 17,
    name: "pipeline_lip_sync_preparations",
    sql: `
      CREATE TABLE pipeline_lip_sync_preparations (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES pipeline_canvas_nodes(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
        video_fingerprint TEXT NOT NULL,
        provider_session_id TEXT,
        remote_task_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('analyzing', 'ready', 'failed')),
        faces_json TEXT NOT NULL DEFAULT '[]',
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX pipeline_lip_sync_preparations_node_idx
        ON pipeline_lip_sync_preparations(node_id, video_fingerprint, updated_at DESC);
    `,
  },
];
