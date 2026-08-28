import { afterEach, describe, expect, it } from "vitest";
import { SqliteDatabase } from "./sqlite-database";

describe("SqliteDatabase", () => {
  let database: SqliteDatabase | undefined;

  afterEach(() => database?.close());

  it("applies each schema migration exactly once", () => {
    database = new SqliteDatabase(":memory:");

    expect(database.prepare(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    ).all()).toEqual([
      { version: 1, name: "initial_generation_schema" },
      { version: 2, name: "generation_retry_idempotency" },
      { version: 3, name: "generation_route_input_schema" },
      { version: 4, name: "generation_paid_capability_settings" },
      { version: 5, name: "generation_route_product" },
      { version: 6, name: "generation_provider_audit_snapshots" },
      { version: 7, name: "generation_run_chat_workflow_source" },
      { version: 8, name: "pipeline_tables" },
      { version: 9, name: "pipeline_media_canvas" },
      { version: 10, name: "pipeline_canvas_revision" },
      { version: 11, name: "pipeline_canvas_edge_bindings" },
      { version: 12, name: "generation_route_presentation" },
      { version: 13, name: "generation_transient_failure_count" },
      { version: 14, name: "generation_route_catalog_lifecycle" },
    ]);
    expect(database.prepare("PRAGMA table_info(pipeline_canvas_edges)").all())
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "role", dflt_value: "'reference'" }),
        expect.objectContaining({ name: "sort_order", dflt_value: "0" }),
      ]));
    expect(database.prepare("PRAGMA table_info(provider_jobs)").all())
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "transient_failure_count", dflt_value: "0" }),
      ]));
    expect(database.prepare("PRAGMA table_info(generation_routes)").all())
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "navigation_label", dflt_value: "''" }),
        expect.objectContaining({ name: "retired_at", dflt_value: null }),
      ]));
    expect(database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'sessions',
        'generation_routes',
        'generation_runs',
        'provider_jobs',
        'generation_artifacts',
        'pipeline_projects',
        'pipeline_assets',
        'pipeline_asset_variants',
        'pipeline_frames',
        'pipeline_canvas_nodes',
        'pipeline_canvas_edges',
        'pipeline_canvas_drafts',
        'pipeline_canvas_workflows'
      )
      ORDER BY name
    `).all()).toEqual([
    { name: "generation_artifacts" },
    { name: "generation_routes" },
    { name: "generation_runs" },
    { name: "pipeline_asset_variants" },
    { name: "pipeline_assets" },
    { name: "pipeline_canvas_drafts" },
    { name: "pipeline_canvas_edges" },
    { name: "pipeline_canvas_nodes" },
    { name: "pipeline_canvas_workflows" },
    { name: "pipeline_frames" },
    { name: "pipeline_projects" },
    { name: "provider_jobs" },
    { name: "sessions" },
    ]);
  });

  it("accepts chat workflow generation runs after rebuilding the source constraint", () => {
    database = new SqliteDatabase(":memory:");
    database.exec(`
      INSERT INTO sessions(id, cwd, origin, created_at, updated_at)
      VALUES ('session-1', 'D:\\project', 'chat', 'now', 'now');
      INSERT INTO generation_routes(
        id, name, capability, provider_id, provider_operation, enabled,
        is_default, revision, defaults_json, adapter_config_json,
        input_schema_json, product, created_at, updated_at
      ) VALUES (
        'route-1', 'Route', 'text-to-image', 'provider', 'operation', 1,
        1, 1, '{}', '{}', '{"prompt":{"required":true}}', '', 'now', 'now'
      );
      INSERT INTO generation_runs(
        id, session_id, capability, route_id, status, prompt, input_json,
        source, source_ref, idempotency_key, created_at, updated_at
      ) VALUES (
        'run-1', 'session-1', 'text-to-image', 'route-1', 'queued', 'prompt', '{}',
        'chat-workflow', 'turn-1', 'chat-turn:session-1:turn-1', 'now', 'now'
      );
    `);

    expect(database.prepare("SELECT source, source_ref FROM generation_runs").get())
      .toEqual({ source: "chat-workflow", source_ref: "turn-1" });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("rolls back failed transactions", () => {
    database = new SqliteDatabase(":memory:");

    expect(() => database?.transaction(() => {
      database?.prepare(`
        INSERT INTO sessions(id, cwd, origin, created_at, updated_at)
        VALUES ('session-1', 'D:\\project', 'chat', 'now', 'now')
      `).run();
      throw new Error("stop");
    })).toThrow("stop");

    expect(database.prepare("SELECT id FROM sessions").all()).toEqual([]);
  });
});
