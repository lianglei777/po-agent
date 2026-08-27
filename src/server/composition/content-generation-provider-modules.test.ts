import { describe, expect, it } from "vitest";
import {
  createGenerationProviderDescriptors,
  createGenerationProviders,
  createGenerationRoutes,
  createGenerationWorkerPolicies,
} from "./content-generation-provider-modules";

describe("content generation provider modules", () => {
  it("registers providers, credentials and routes from the same module list", () => {
    expect(createGenerationProviders().map((provider) => provider.providerId)).toEqual([
      "runninghub",
      "qianwen",
    ]);
    expect(createGenerationProviderDescriptors()).toEqual([
      expect.objectContaining({
        providerId: "runninghub",
        credential: expect.objectContaining({ environmentVariable: "RUNNINGHUB_API_KEY" }),
      }),
      expect.objectContaining({
        providerId: "qianwen",
        displayName: "千问AI平台",
        credential: expect.objectContaining({
          reference: "qianwen:default",
          environmentVariable: "DASHSCOPE_API_KEY",
        }),
      }),
    ]);
    expect(createGenerationRoutes().some((route) => (
      route.id === "qianwen-wan-3-0-text-to-video"
    ))).toBe(true);
    expect(createGenerationWorkerPolicies()).toEqual({
      runninghub:{maxConcurrent:2},
      qianwen:{maxConcurrent:2},
    });
  });
});
