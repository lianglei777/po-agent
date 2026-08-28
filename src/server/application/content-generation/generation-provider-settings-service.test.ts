import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StaticGenerationProviderDirectory } from "@/server/infrastructure/content-generation/static-generation-provider-directory";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import type { GenerationCredentialStore } from "@/server/ports/generation-provider";
import { GenerationProviderSettingsService } from "./generation-provider-settings-service";

const NOW = "2026-08-27T00:00:00.000Z";

class MemoryCredentialStore implements GenerationCredentialStore {
  private readonly values = new Map<string, string>();

  async getCredential(reference: string) {
    return this.values.get(reference) ?? null;
  }

  async hasCredential(reference: string) {
    return this.values.has(reference);
  }

  async inspectCredential(reference: string) {
    return this.values.has(reference)
      ? { hasCredential: true, source: "stored-file" as const, location: "memory://credentials" }
      : { hasCredential: false, source: "missing" as const, location: "memory://credentials" };
  }

  async setCredential(reference: string, value: string) {
    if (value) this.values.set(reference, value);
    else this.values.delete(reference);
  }
}

describe("GenerationProviderSettingsService", () => {
  let database: SqliteDatabase;
  let service: GenerationProviderSettingsService;

  beforeEach(() => {
    database = new SqliteDatabase(":memory:");
    const directory = new StaticGenerationProviderDirectory([
      {
        providerId: "runninghub",
        displayName: "RunningHub",
        credential: {
          reference: "runninghub:default",
          kind: "api-key",
          environmentVariable: "RUNNINGHUB_API_KEY",
        },
      },
      {
        providerId: "qianwen",
        displayName: "千问AI平台",
        credential: {
          reference: "qianwen:default",
          kind: "api-key",
          environmentVariable: "DASHSCOPE_API_KEY",
        },
      },
    ]);
    service = new GenerationProviderSettingsService(
      new SqliteGenerationRepository(database),
      new MemoryCredentialStore(),
      directory,
      () => new Date(NOW),
    );
  });

  afterEach(() => database.close());

  it("lists trusted providers with independent settings and credential state", async () => {
    await service.setProviderEnabled("qianwen", true);
    await service.setCredential("qianwen", "secret");

    await expect(service.listProviders()).resolves.toMatchObject([
      {
        providerId: "runninghub",
        displayName: "RunningHub",
        enabled: false,
        credential: {
          hasCredential: false,
          source: "missing",
          location: "memory://credentials",
        },
      },
      {
        providerId: "qianwen",
        displayName: "千问AI平台",
        enabled: true,
        credential: {
          hasCredential: true,
          source: "stored-file",
          location: "memory://credentials",
          environmentVariable: "DASHSCOPE_API_KEY",
        },
      },
    ]);
  });

  it("maps provider IDs to trusted credential references", async () => {
    await service.setCredential("qianwen", "secret");

    await expect(service.getCredentialStatus("qianwen")).resolves.toEqual({
      hasCredential: true,
      source: "stored-file",
      location: "memory://credentials",
    });
    await expect(service.setCredential("qianwen", "")).resolves.toEqual({
      hasCredential: false,
      source: "missing",
      location: "memory://credentials",
    });
  });

  it("rejects unknown provider IDs before changing settings or credentials", async () => {
    await expect(service.setProviderEnabled("unknown", true)).rejects.toMatchObject({
      code: "GENERATION_PROVIDER_NOT_FOUND",
      status: 404,
    });
    await expect(service.setCredential("unknown", "secret")).rejects.toMatchObject({
      code: "GENERATION_PROVIDER_NOT_FOUND",
      status: 404,
    });
  });
});
