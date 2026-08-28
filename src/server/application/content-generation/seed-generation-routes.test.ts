import { afterEach, describe, expect, it } from "vitest";
import type { GenerationRoute } from "@/server/domain/generation";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { seedGenerationRoutes } from "./seed-generation-routes";

const NOW = "2026-08-28T00:00:00.000Z";

describe("seedGenerationRoutes", () => {
  let database: SqliteDatabase | undefined;

  afterEach(() => database?.close());

  it("retires routes removed from a managed provider catalog", async () => {
    database = new SqliteDatabase(":memory:");
    const repository = new SqliteGenerationRepository(database);
    await repository.upsertRoute(route("retired-route", true));

    await seedGenerationRoutes(repository, [route("active-route", false)]);

    await expect(repository.listRoutes()).resolves.toEqual([
      expect.objectContaining({
        id: "active-route",
        isDefault: true,
        navigationLabel: "text-to-image",
      }),
    ]);
    await expect(repository.getRoute("retired-route")).resolves.toEqual(
      expect.objectContaining({ enabled: false, isDefault: false, retiredAt: NOW }),
    );
  });
});

function route(id: string, isDefault: boolean): GenerationRoute {
  return {
    id,
    name: id,
    navigationLabel: "text-to-image",
    description: "Test route",
    tags: [],
    capability: "text-to-image",
    product: "Test Product",
    providerId: "qianwen",
    providerOperation: id,
    enabled: true,
    isDefault,
    revision: 1,
    defaults: {},
    inputSchema: { prompt: { required: true } },
    adapterConfig: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}
