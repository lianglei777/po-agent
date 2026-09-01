import { describe, expect, it } from "vitest";
import { generationRouteDto, generationRunViewDto } from "./generation-response-mapper";

describe("generationRunViewDto", () => {
  it("does not expose credentials, leases, or adapter snapshots", () => {
    const dto = generationRunViewDto({
      run: {
        id: "run-1",
        sessionId: "session-1",
        capability: "text-to-video",
        routeId: "route-1",
        status: "running",
        prompt: "test",
        input: { prompt: "test" },
        source: "api",
        idempotencyKey: "secret-idempotency-key",
        createdAt: "now",
        updatedAt: "now",
      },
      jobs: [{
        id: "job-1",
        runId: "run-1",
        attempt: 1,
        providerId: "runninghub",
        providerOperation: "text-to-video",
        routeRevision: 1,
        resolvedConfigSnapshot: { internal: true },
        credentialRef: "runninghub:default",
        status: "polling",
        transientFailureCount: 2,
        leaseOwner: "worker-secret",
        leaseExpiresAt: "later",
        createdAt: "now",
        updatedAt: "now",
      }],
      artifacts: [],
    });

    expect(dto.jobs).toEqual([{
      id: "job-1",
      runId: "run-1",
      attempt: 1,
      providerId: "runninghub",
      providerOperation: "text-to-video",
      status: "polling",
      transientFailureCount: 2,
      createdAt: "now",
      updatedAt: "now",
    }]);
    expect(JSON.stringify(dto)).not.toContain("credentialRef");
    expect(JSON.stringify(dto)).not.toContain("worker-secret");
    expect(JSON.stringify(dto)).not.toContain("resolvedConfigSnapshot");
    expect(JSON.stringify(dto)).not.toContain("secret-idempotency-key");
  });
});

describe("generationRouteDto", () => {
  it("exposes route selection data without provider protocol or credential config", () => {
    const dto = generationRouteDto({
      id: "route-1",
      name: "RunningHub video",
      description: "Create a video from text",
      tags: ["Text to video"],
      capability: "text-to-video",
      product: "Seedance 2.0",
      providerId: "runninghub",
      providerOperation: "internal-operation",
      enabled: true,
      isDefault: true,
      revision: 2,
      defaults: { durationSeconds: 5 },
      inputSchema: { prompt: { required: true } },
      adapterConfig: { secretProtocolValue: true },
      credentialRef: "runninghub:default",
      createdAt: "now",
      updatedAt: "now",
    });

    expect(dto).toEqual({
      id: "route-1",
      name: "RunningHub video",
      description: "Create a video from text",
      tags: ["Text to video"],
      capability: "text-to-video",
      product: "Seedance 2.0",
      providerId: "runninghub",
      enabled: true,
      isDefault: true,
      revision: 2,
      defaults: { durationSeconds: 5 },
      inputSchema: { prompt: { required: true } },
    });
    expect(JSON.stringify(dto)).not.toContain("credentialRef");
    expect(JSON.stringify(dto)).not.toContain("internal-operation");
  });

  it("does not expose server-owned generation parameters", () => {
    const dto = generationRouteDto({
      id: "lip-sync",
      name: "Kling lip sync",
      description: "Lip sync",
      tags: [],
      capability: "audio-to-video",
      product: "Kling",
      providerId: "runninghub",
      providerOperation: "kling-lip-sync-video",
      enabled: true,
      isDefault: false,
      revision: 1,
      defaults: {},
      inputSchema: {
        prompt: { required: false },
        parameters: [
          { key: "sessionId", label: "Session", type: "text", internal: true },
          { key: "soundVolume", label: "Volume", type: "number" },
        ],
      },
      adapterConfig: {},
      credentialRef: "runninghub:default",
      createdAt: "now",
      updatedAt: "now",
    });

    expect(dto.inputSchema.parameters).toEqual([
      { key: "soundVolume", label: "Volume", type: "number" },
    ]);
    expect(JSON.stringify(dto)).not.toContain("sessionId");
  });
});
