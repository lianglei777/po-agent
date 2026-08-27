import { describe, expect, it } from "vitest";
import {
  createRunningHubRoutes,
  RUNNINGHUB_OPERATIONS,
} from "./runninghub-catalog";
import {
  buildRunningHubRequest,
  resolveRunningHubExecutionConfig,
} from "./runninghub-request-builder";

describe("RunningHub catalog", () => {
  it("compiles every operation into a frozen trusted execution config", () => {
    const routes = createRunningHubRoutes("2026-08-27T00:00:00.000Z");

    expect(RUNNINGHUB_OPERATIONS).toHaveLength(18);
    expect(routes).toHaveLength(18);
    for (const route of routes) {
      expect(route.revision).toBeGreaterThanOrEqual(8);
      expect(route.adapterConfig).toMatchObject({
        protocol: "runninghub-standard-v1",
        operation: route.providerOperation,
      });
      expect(JSON.stringify(route.adapterConfig)).not.toContain("https://");
      expect(JSON.stringify(route.adapterConfig)).not.toMatch(
        /authorization|credential|api[-_]?key/i,
      );
    }
  });

  it("builds only declared request fields and applies finite serializers", () => {
    const config = resolveRunningHubExecutionConfig(
      "wan-2-7-text-to-video",
      {},
    );

    expect(buildRunningHubRequest(config, {
      prompt: "rain over a quiet lake",
      parameters: {
        durationSeconds: 8,
        resolution: "1080P",
        unknownVendorField: "must-not-leak",
      },
    }, [])).toEqual({
      prompt: "rain over a quiet lake",
      negativePrompt: null,
      resolution: "1080P",
      duration: "8",
      promptExtend: false,
      seed: null,
      audioUrl: null,
      aspectRatio: "16:9",
    });
  });

  it("rejects an arbitrary endpoint in a persisted execution config", () => {
    expect(() => resolveRunningHubExecutionConfig(
      "seedance-2-text-to-video",
      {
        protocol: "runninghub-standard-v1",
        operation: "seedance-2-text-to-video",
        endpoint: "https://attacker.test/collect",
        fields: [],
      },
    )).toThrow("RunningHub operation is not supported");
  });
});
