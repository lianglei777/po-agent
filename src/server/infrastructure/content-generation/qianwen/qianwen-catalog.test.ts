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

  it("registers the second video batch with pinned Wan snapshots", () => {
    const routes=createQianwenRoutes("2026-08-27T00:00:00.000Z");
    const secondBatch=routes.filter(route=>["Wan 2.7","HappyHorse 1.1","MiniMax-H3"].includes(route.product));
    expect(secondBatch).toHaveLength(9);
    expect(secondBatch.map(route=>route.capability)).toEqual([
      "text-to-video","image-to-video","multimodal-to-video",
      "text-to-video","image-to-video","multimodal-to-video",
      "text-to-video","image-to-video","multimodal-to-video",
    ]);
    expect(secondBatch.find(route=>route.id==="qianwen-wan-2-7-text-to-video")?.adapterConfig)
      .toMatchObject({vendorModel:"wan2.7-t2v-2026-06-12",requestProfile:"wan-2-7-video-v1"});
    expect(secondBatch.find(route=>route.id==="qianwen-wan-2-7-reference-to-video")?.inputSchema.constraints)
      .toContainEqual({kind:"max-total-assets",slots:["imageUrls","videoUrls"],maxFiles:5});
  });

  it("builds finite requests for Wan 2.7, HappyHorse and MiniMax-H3", () => {
    const routes=createQianwenRoutes();
    const prepared=(slot:string,url:string,order=0)=>({slot,order,name:"asset",mimeType:"image/png",reference:{kind:"dashscope-oss",url,vendorModel:"wan2.7-t2v-2026-06-12"}});
    const wanRoute=routes.find(route=>route.id==="qianwen-wan-2-7-text-to-video")!;
    const wanConfig=resolveQianwenExecutionConfig(wanRoute.providerOperation,wanRoute.adapterConfig);
    expect(buildQianwenRequest(wanConfig,{prompt:"人物说话",parameters:{resolution:"1080P",aspectRatio:"16:9",durationSeconds:8,promptExtend:false,watermark:false,negativePrompt:"模糊"}},[prepared("audioUrl","oss://dashscope-instant/audio.mp3")])).toEqual({
      model:"wan2.7-t2v-2026-06-12",input:{prompt:"人物说话",negative_prompt:"模糊",audio_url:"oss://dashscope-instant/audio.mp3"},parameters:{resolution:"1080P",ratio:"16:9",duration:8,watermark:false,prompt_extend:false},
    });
    const horse=routes.find(route=>route.id==="qianwen-happyhorse-1-1-text-to-video")!;
    expect(buildQianwenRequest(resolveQianwenExecutionConfig(horse.providerOperation,horse.adapterConfig),{prompt:"纸板城市",parameters:{resolution:"720P",aspectRatio:"21:9",durationSeconds:5,watermark:true}},[])).toMatchObject({model:"happyhorse-1.1-t2v",parameters:{resolution:"720P",ratio:"21:9",duration:5,watermark:true}});
    const mini=routes.find(route=>route.id==="qianwen-minimax-h3-text-to-video")!;
    expect(buildQianwenRequest(resolveQianwenExecutionConfig(mini.providerOperation,mini.adapterConfig),{prompt:"太空舰队",parameters:{resolution:"2K",aspectRatio:"adaptive",durationSeconds:10,watermark:false}},[])).toMatchObject({model:"MiniMax/MiniMax-H3",parameters:{resolution:"2K",ratio:"adaptive",duration:10,watermark:false}});
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
