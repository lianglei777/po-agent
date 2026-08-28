import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@/contracts/generation";
import { QianwenAdapter } from "./qianwen-adapter";
import {
  createQianwenRoutes,
  QIANWEN_WAN_2_5_TEXT_TO_IMAGE_OPERATION,
  QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION,
} from "./qianwen-catalog";

const [ROUTE] = createQianwenRoutes("2026-08-27T00:00:00.000Z");

describe("QianwenAdapter", () => {
  it("returns Z-Image synchronous outputs without polling", async () => {
    const route=createQianwenRoutes().find(item=>item.id==="qianwen-z-image-text-to-image")!;
    const fetcher=vi.fn<typeof fetch>(async()=>jsonResponse({output:{choices:[{message:{content:[{image:"https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/z.png?Signature=signed"}]}}]}}));
    const result=await new QianwenAdapter(fetcher).submit({operation:route.providerOperation,executionConfig:route.adapterConfig,generation:{prompt:"一只橘猫",parameters:{size:"1024*1024",promptExtend:false,seed:7}},assets:[],credential:"secret"});
    expect(result).toMatchObject({state:"succeeded",outputs:[{outputType:"png"}]});
    expect(fetcher.mock.calls[0][0]).toBe("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation");
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("X-DashScope-Async");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({model:"z-image-turbo",input:{messages:[{role:"user",content:[{text:"一只橘猫"}]}]},parameters:{size:"1024*1024",prompt_extend:false,seed:7}});
  });

  it("normalizes all Wan 2.6 asynchronous image outputs", async () => {
    const route=compatImageRoute(QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION,"image-generation","wan2.6-t2i","messages-text-image-v1","choices-content-image-v1");
    const fetcher=vi.fn<typeof fetch>(async()=>jsonResponse({output:{task_id:"image-task",task_status:"SUCCEEDED",choices:[{message:{content:[{image:"https://dashscope-463f.oss-accelerate.aliyuncs.com/1.png"},{image:"https://dashscope-463f.oss-accelerate.aliyuncs.com/2.png"}]}}]}}));
    const result=await new QianwenAdapter(fetcher).poll({operation:route.providerOperation,executionConfig:route.adapterConfig,remoteTaskId:"image-task",credential:"secret"});
    expect(result).toMatchObject({state:"succeeded",outputs:[{outputType:"png"},{outputType:"png"}]});
  });

  it("submits and normalizes the legacy image protocol", async () => {
    const route=compatImageRoute(QIANWEN_WAN_2_5_TEXT_TO_IMAGE_OPERATION,"legacy-image-synthesis","wan2.5-t2i-preview","legacy-prompt-image-v1","legacy-results-image-v1");
    const fetcher=vi.fn<typeof fetch>(async()=>jsonResponse({output:{task_id:"legacy-task",task_status:"SUCCEEDED",results:[{url:"https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/1.png"},{url:"https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/2.png"}]}}));
    const adapter=new QianwenAdapter(fetcher);
    const submitted=await adapter.submit({operation:route.providerOperation,executionConfig:route.adapterConfig,generation:{prompt:"江南水乡",parameters:route.defaults},assets:[],credential:"secret"});
    expect(fetcher.mock.calls[0][0]).toBe("https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({"X-DashScope-Async":"enable"});
    expect(submitted).toMatchObject({state:"succeeded",outputs:[{outputType:"png"},{outputType:"png"}]});
  });
  it("submits an async Wan 3.0 task with the required headers", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      request_id: "request-1",
      output: { task_id: "task-1", task_status: "PENDING" },
    }));
    const adapter = new QianwenAdapter(fetcher);

    const result = await adapter.submit({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      generation: {
        prompt: "海边奔跑的金毛",
        parameters: {
          resolution: "720P",
          aspectRatio: "16:9",
          durationSeconds: 10,
          generateAudio: false,
          promptExtend: true,
          watermark: false,
          seed: 9,
        },
      },
      assets: [],
      credential: "secret-key",
    });

    expect(result).toMatchObject({
      state: "pending",
      remoteTaskId: "task-1",
      remoteStatus: "PENDING",
      outputs: [],
      retryAfterMs: 15_000,
    });
    expect(JSON.stringify(result.requestSnapshot)).not.toContain("secret-key");
    expect(fetcher).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        redirect: "error",
      }),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      model: "wan3.0-video",
      input: { prompt: "海边奔跑的金毛" },
      parameters: {
        resolution: "720P",
        ratio: "16:9",
        duration: 10,
        audio: false,
        prompt_extend: true,
        watermark: false,
        seed: 9,
      },
    });
  });

  it("polls a completed task and redacts signed output URLs in snapshots", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      request_id: "request-2",
      output: {
        task_id: "task-2",
        task_status: "SUCCEEDED",
        video_url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/video.mp4?OSSAccessKeyId=access-key&Signature=signature&security-token=token",
      },
    }));
    const adapter = new QianwenAdapter(fetcher);

    const result = await adapter.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-2/unsafe",
      credential: "secret-key",
    });

    expect(fetcher.mock.calls[0][0]).toBe(
      "https://dashscope.aliyuncs.com/api/v1/tasks/task-2%2Funsafe",
    );
    expect(result).toMatchObject({
      state: "succeeded",
      remoteTaskId: "task-2",
      outputs: [{
        url: expect.stringContaining("OSSAccessKeyId=access-key"),
        outputType: "mp4",
      }],
      rawSnapshot: {
        output: {
          video_url: expect.stringContaining("OSSAccessKeyId=%5BREDACTED%5D"),
        },
      },
    });
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("access-key");
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("Signature=signature");
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("security-token=token");
  });

  it("normalizes provider failures without scheduling another poll", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      output: {
        task_id: "task-3",
        task_status: "FAILED",
        code: "InvalidParameter",
        message: "invalid ratio",
      },
    }));
    const adapter = new QianwenAdapter(fetcher);

    await expect(adapter.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-3",
      credential: "secret-key",
    })).resolves.toMatchObject({
      state: "failed",
      errorCode: "InvalidParameter",
      errorMessage: "invalid ratio",
      retryAfterMs: undefined,
    });
  });

  it("preserves a top-level business error returned with HTTP 200", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      request_id: "request-error",
      code: "InvalidParameter",
      message: "invalid prompt",
    }));

    await expect(new QianwenAdapter(fetcher).submit({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      generation: { prompt: "test" },
      assets: [],
      credential: "secret-key",
    })).resolves.toMatchObject({
      state: "failed",
      errorCode: "InvalidParameter",
      errorMessage: "invalid prompt",
    });
  });

  it("rejects undocumented task statuses instead of polling forever", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      output: {
        task_id: "task-unknown-status",
        task_status: "QUEUED_FOR_REVIEW",
      },
    }));

    await expect(new QianwenAdapter(fetcher).poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-unknown-status",
      credential: "secret-key",
    })).resolves.toMatchObject({
      state: "failed",
      errorCode: "GENERATION_PROVIDER_PROTOCOL_ERROR",
      errorMessage: "Qianwen returned an unsupported task status: QUEUED_FOR_REVIEW",
      retryAfterMs: undefined,
    });
  });

  it("uploads assets with a model-bound policy and no API authorization on OSS", async () => {
    const imageRoute = createQianwenRoutes().find((route) => route.capability === "image-to-video")!;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: { policy: "policy", signature: "signature", upload_dir: "dashscope-instant/account/day/id", upload_host: "https://dashscope-file-bj.oss-cn-beijing.aliyuncs.com", expire_in_seconds: 300, max_file_size_mb: 100, oss_access_key_id: "access", x_oss_object_acl: "private", x_oss_forbid_overwrite: "true" } }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const adapter = new QianwenAdapter(fetcher, () => new Date("2026-08-27T00:00:00.000Z"));
    await expect(adapter.prepareAssets({
      operation: imageRoute.providerOperation,
      executionConfig: imageRoute.adapterConfig,
      assets: [{
        slot: "firstFrameUrl",
        name: "../frame.png",
        mimeType: "image/png",
        data: new Uint8Array([1]),
      }],
      credential: "secret-key",
    })).resolves.toMatchObject([{ reference: { kind: "dashscope-oss", url: "oss://dashscope-instant/account/day/id/frame.png", vendorModel: "wan3.0-video" }, expiresAt: "2026-08-28T23:00:00.000Z" }]);
    expect(fetcher.mock.calls[0][0]).toContain("model=wan3.0-video");
    expect(fetcher.mock.calls[1][1]?.headers).toBeUndefined();
    expect(fetcher.mock.calls[1][1]?.body).toBeInstanceOf(FormData);
  });

  it("preserves upload-policy Retry-After for the durable worker", async () => {
    const imageRoute=createQianwenRoutes().find(route=>route.capability==="image-to-video")!;
    const fetcher=vi.fn<typeof fetch>(async()=>jsonResponse({message:"upload policy limited"},429,{"retry-after":"30"}));
    await expect(new QianwenAdapter(fetcher).prepareAssets({operation:imageRoute.providerOperation,executionConfig:imageRoute.adapterConfig,assets:[{slot:"firstFrameUrl",name:"frame.png",mimeType:"image/png",data:new Uint8Array([1])}],credential:"secret-key"}))
      .rejects.toMatchObject({code:"GENERATION_PROVIDER_RATE_LIMITED",details:{retryAfterMs:30_000}});
  });

  it("downloads only allowlisted Alibaba OSS result hosts without redirects", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      new Uint8Array([1, 2, 3]),
      { status: 200, headers: { "content-type": "video/mp4" } },
    ));
    const adapter = new QianwenAdapter(fetcher);

    await expect(adapter.download(
      "https://attacker.test/video.mp4",
    )).rejects.toMatchObject({ code: "GENERATION_DOWNLOAD_URL_REJECTED" });
    await expect(adapter.download(
      "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/video.mp4?Signature=signed",
    )).resolves.toEqual({
      data: new Uint8Array([1, 2, 3]),
      contentType: "video/mp4",
    });
    await expect(adapter.download(
      "https://model-result.oss-cn-shanghai.aliyuncs.com/video.mp4?Signature=signed",
    )).resolves.toMatchObject({ contentType: "video/mp4" });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it("maps invalid JSON and HTTP errors to operational provider errors", async () => {
    const invalidJson = new QianwenAdapter(vi.fn<typeof fetch>(async () => (
      new Response("not-json", { status: 200 })
    )));
    await expect(invalidJson.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-4",
      credential: "secret-key",
    })).rejects.toMatchObject({ code: "GENERATION_PROVIDER_PROTOCOL_ERROR" });

    const failedRequest = new QianwenAdapter(vi.fn<typeof fetch>(async () => jsonResponse(
      { code: "InvalidApiKey", message: "invalid API key" },
      401,
    )));
    await expect(failedRequest.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-5",
      credential: "secret-key",
    })).rejects.toMatchObject({
      code: "GENERATION_PROVIDER_ERROR",
      message: "invalid API key",
      details: {
        submissionRejected: true,
        providerCode: "InvalidApiKey",
      },
    });

    const rateLimited = new QianwenAdapter(vi.fn<typeof fetch>(async () => jsonResponse(
      { message: "too many requests" },
      429,
      { "retry-after": "45" },
    )));
    await expect(rateLimited.poll({operation:ROUTE.providerOperation,executionConfig:ROUTE.adapterConfig,remoteTaskId:"task-limited",credential:"secret-key"}))
      .rejects.toMatchObject({code:"GENERATION_PROVIDER_RATE_LIMITED",status:429,details:{retryAfterMs:45_000}});
  });
});

function compatImageRoute(
  operation: typeof QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION | typeof QIANWEN_WAN_2_5_TEXT_TO_IMAGE_OPERATION,
  endpointId: "image-generation" | "legacy-image-synthesis",
  vendorModel: "wan2.6-t2i" | "wan2.5-t2i-preview",
  requestProfile: "messages-text-image-v1" | "legacy-prompt-image-v1",
  resultProfile: "choices-content-image-v1" | "legacy-results-image-v1",
) {
  return {
    providerOperation: operation,
    defaults: { size: "1280*1280", imageCount: 2 },
    adapterConfig: {
      protocol: "dashscope-media-v1", operation, endpointId, vendorModel,
      requestProfile, resultProfile, assetBindings: [], pollIntervalMs: 5000,
      submitMode: "async-task",
    } as JsonValue,
  };
}

function jsonResponse(value: unknown, status = 200, headers:Record<string,string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
