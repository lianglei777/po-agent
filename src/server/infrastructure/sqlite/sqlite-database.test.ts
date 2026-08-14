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
    ]);
    expect(database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'sessions',
        'generation_routes',
        'generation_runs',
        'provider_jobs',
        'generation_artifacts'
      )
      ORDER BY name
    `).all()).toEqual([
      { name: "generation_artifacts" },
      { name: "generation_routes" },
      { name: "generation_runs" },
      { name: "provider_jobs" },
      { name: "sessions" },
    ]);
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
