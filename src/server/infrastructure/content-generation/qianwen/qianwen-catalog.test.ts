import { describe, expect, it } from "vitest";
import { createQianwenRoutes } from "./qianwen-catalog";
import {
  buildQianwenRequest,
  resolveQianwenExecutionConfig,
} from "./qianwen-request-builder";

describe("Qianwen catalog", () => {
  it("registers synchronous and asynchronous image profiles", () => {
    const routes=createQianwenRoutes("2026-08-27T00:00:00.000Z");
    expect(routes.map(route=>route.id)).toEqual(expect.arrayContaining(["qianwen-z-image-text-to-image","qianwen-wan-2-6-text-to-image"]));
    expect(routes.find(route=>route.id==="qianwen-z-image-text-to-image")).toMatchObject({capability:"text-to-image",inputSchema:{prompt:{maxLength:800}},adapterConfig:{submitMode:"sync",vendorModel:"z-image-turbo"}});
    expect(routes.find(route=>route.id==="qianwen-wan-2-6-text-to-image")).toMatchObject({defaults:{imageCount:1,size:"1280*1280"},adapterConfig:{submitMode:"async-task",pollIntervalMs:5000}});
  });
  it("compiles the Wan 3.0 text-to-video route with semantic input fields", () => {
    const [route] = createQianwenRoutes("2026-08-27T00:00:00.000Z");

    expect(route).toMatchObject({
      id: "qianwen-wan-3-0-text-to-video",
      providerId: "qianwen",
      providerOperation: "wan-3-0-text-to-video",
      capability: "text-to-video",
      enabled: false,
      isDefault: false,
      revision: 2,
      credentialRef: "qianwen:default",
      defaults: {
        resolution: "1080P",
        aspectRatio: "adaptive",
        durationSeconds: 5,
        generateAudio: true,
        promptExtend: true,
        watermark: false,
      },
      inputSchema: { prompt: { required: true, maxLength: 20_000 } },
      adapterConfig: {
        protocol: "dashscope-media-v1",
        endpointId: "video-synthesis",
        vendorModel: "wan3.0-video",
        requestProfile: "wan-3-video-v1",
        resultProfile: "video-url-v1",
        pollIntervalMs: 15_000,
      },
    });
    expect(route.inputSchema.assets).toBeUndefined();
  });

  it("maps only declared semantic parameters to DashScope fields", () => {
    const [route] = createQianwenRoutes();
    const config = resolveQianwenExecutionConfig(
      route.providerOperation,
      route.adapterConfig,
    );

    expect(buildQianwenRequest(config, {
      prompt: "月光下奔跑的小猫",
      parameters: {
        resolution: "720P",
        aspectRatio: "16:9",
        durationSeconds: -1,
        generateAudio: false,
        promptExtend: false,
        watermark: true,
        seed: 7,
        arbitraryVendorField: "must-not-leak",
      },
    })).toEqual({
      model: "wan3.0-video",
      input: { prompt: "月光下奔跑的小猫" },
      parameters: {
        resolution: "720P",
        ratio: "16:9",
        duration: -1,
        audio: false,
        prompt_extend: false,
        watermark: true,
        seed: 7,
      },
    });
  });

  it("rejects a mutated endpoint profile from a persisted job", () => {
    const [route] = createQianwenRoutes();
    expect(() => resolveQianwenExecutionConfig(route.providerOperation, {
      ...(route.adapterConfig as Record<string, never>),
      endpointId: "https://attacker.test/collect",
    })).toThrow("Qianwen operation is not supported");
  });
});
