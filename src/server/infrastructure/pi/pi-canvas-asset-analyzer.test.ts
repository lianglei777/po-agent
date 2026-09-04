import { describe, expect, it } from "vitest";
import { parseCanvasAssetAnalysis, PiCanvasAssetAnalyzer } from "./pi-canvas-asset-analyzer";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

describe("parseCanvasAssetAnalysis", () => {
  it("extracts and bounds structured visual evidence", () => {
    expect(parseCanvasAssetAnalysis(`Result: {"summary":"红色运动鞋产品图","subjects":["运动鞋"],"composition":"居中","materials":["网布"],"style":"商业摄影","lighting":"柔光","visibleText":["PO"],"brandElements":["侧面标志"],"suggestedRoles":["subject","style","invalid"]}`))
      .toMatchObject({ summary: "红色运动鞋产品图", subjects: ["运动鞋"], suggestedRoles: ["subject", "style"] });
  });

  it("returns a specific error when the selected model has no image input", async () => {
    const runtime = {
      getModel: () => ({ provider: "provider", id: "text-only", input: ["text"] }),
    } as unknown as ModelRuntime;
    const analyzer = new PiCanvasAssetAnalyzer(Promise.resolve(runtime));
    await expect(analyzer.validateVisionModel({ provider: "provider", modelId: "text-only" }))
      .rejects.toMatchObject({ code: "PIPELINE_AGENT_MODEL_VISION_REQUIRED", status: 409 });
    await expect(analyzer.analyzeImage({
      provider: "provider", modelId: "text-only", name: "asset.png", mimeType: "image/png",
      data: new Uint8Array([1]),
    })).rejects.toMatchObject({ code: "PIPELINE_AGENT_MODEL_VISION_REQUIRED", status: 409 });
  });
});
