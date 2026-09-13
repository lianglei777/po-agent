import { describe, expect, it, vi } from "vitest";
import { GenerationAssetService } from "./generation-asset-service";

describe("GenerationAssetService.readArtifact", () => {
  it("reads the persisted artifact path from its owning session workspace", async () => {
    const runs = {
      getArtifact: vi.fn().mockResolvedValue({
        id: "artifact-1",
        runId: "run-1",
        localPath: ".po-agent/generated/run-1/image.png",
      }),
      getRun: vi.fn().mockResolvedValue({ run: { sessionId: "session-1" } }),
      requireSession: vi.fn().mockResolvedValue({ cwd: "D:\\project" }),
    };
    const files = {
      readInput: vi.fn().mockResolvedValue({
        name: "image.png",
        mimeType: "image/png",
        data: new Uint8Array([1, 2, 3]),
      }),
    };
    const service = new GenerationAssetService(runs as never, files as never);

    await expect(service.readArtifact("artifact-1")).resolves.toMatchObject({
      name: "image.png",
      mimeType: "image/png",
    });
    expect(files.readInput).toHaveBeenCalledWith({
      cwd: "D:\\project",
      relativePath: ".po-agent/generated/run-1/image.png",
      slot: "preview",
    });
  });

  it("rejects artifacts without a persisted local path", async () => {
    const runs = {
      getArtifact: vi.fn().mockResolvedValue({ id: "artifact-1", runId: "run-1" }),
    };
    const service = new GenerationAssetService(runs as never, {} as never);

    await expect(service.readArtifact("artifact-1")).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
      status: 404,
    });
  });
});
