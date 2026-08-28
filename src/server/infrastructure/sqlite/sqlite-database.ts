import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { SQLITE_MIGRATIONS } from "./sqlite-migrations";

export class SqliteDatabase {
  private readonly database: DatabaseSync;

  constructor(filePath: string) {
    if (filePath !== ":memory:") {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    this.database = new DatabaseSync(filePath, { timeout: 5_000 });
    this.configure();
    this.migrate();
  }

  prepare(sql: string): StatementSync {
    return this.database.prepare(sql);
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  private configure(): void {
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA synchronous = NORMAL");
    this.database.exec("PRAGMA busy_timeout = 5000");
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT
    `);
    const rows = this.database
      .prepare("SELECT version FROM schema_migrations")
      .all() as Array<{ version: number }>;
    const applied = new Set(rows.map((row) => Number(row.version)));
    const insert = this.database.prepare(
      "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
    );

    for (const migration of SQLITE_MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      if (migration.disableForeignKeys) {
        this.database.exec("PRAGMA foreign_keys = OFF");
      }
      try {
        this.transaction(() => {
          // Next.js 构建和桌面启动都可能并行创建容器；拿到写锁后必须复查，避免重复执行 ALTER。
          const alreadyApplied = this.database.prepare(`
            SELECT 1 FROM schema_migrations WHERE version = ?
          `).get(migration.version);
          if (alreadyApplied) return;
          this.database.exec(migration.sql);
          insert.run(migration.version, migration.name, new Date().toISOString());
        });
      } finally {
        if (migration.disableForeignKeys) {
          this.database.exec("PRAGMA foreign_keys = ON");
        }
      }
      if (migration.disableForeignKeys) {
        const violations = this.database.prepare("PRAGMA foreign_key_check").all();
        if (violations.length) {
          throw new Error(`SQLite migration ${migration.version} left invalid foreign keys`);
        }
      }
    }
  }
}
