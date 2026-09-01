import { describe, expect, it, vi } from "vitest";
import type { LipSyncPreparation } from "@/server/domain/pipeline";
import type { GenerationCredentialReader } from "@/server/ports/generation-provider";
import type { LipSyncProvider } from "@/server/ports/lip-sync-provider";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { LipSyncPreparationService } from "./lip-sync-preparation-service";

describe("LipSyncPreparationService", () => {
  it("keeps provider identifiers private and recommends the longest valid face interval", async () => {
    const repository = {
      findLipSyncPreparation: vi.fn().mockResolvedValue(null),
      createLipSyncPreparation: vi.fn().mockImplementation(async (input) => ({
        ...input,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      })),
    } as unknown as PipelineRepository;
    const provider = {
      submitFaceAnalysis: vi.fn().mockResolvedValue({
        state: "ready",
        remoteTaskId: "task-1",
        providerSessionId: "private-session",
        faces: [
          { key: "face-1", providerFaceId: "private-face-1", availableStartMs: 0, availableEndMs: 3_000 },
          { key: "face-2", providerFaceId: "private-face-2", availableStartMs: 500, availableEndMs: 7_000 },
        ],
      }),
    } as unknown as LipSyncProvider;
    const service = new LipSyncPreparationService(
      repository,
      provider,
      { getCredential: vi.fn().mockResolvedValue("secret") } as unknown as GenerationCredentialReader,
      "runninghub:default",
    );

    const result = await service.create({
      nodeId: "node-1",
      projectId: "project-1",
      videoFingerprint: "fingerprint-1",
      video: { slot: "videoUrl", name: "person.mp4", mimeType: "video/mp4", data: new Uint8Array([1]) },
    });

    expect(result.faces).toEqual([
      expect.objectContaining({ key: "face-1", recommended: false }),
      expect.objectContaining({ key: "face-2", recommended: true }),
    ]);
    expect(JSON.stringify(result)).not.toContain("private-session");
    expect(JSON.stringify(result)).not.toContain("private-face");
  });

  it("reuses a ready preparation for the same node and video fingerprint", async () => {
    const existing: LipSyncPreparation = {
      id: "preparation-1",
      nodeId: "node-1",
      projectId: "project-1",
      videoFingerprint: "fingerprint-1",
      providerSessionId: "private-session",
      status: "ready",
      faces: [{ key: "face-1", providerFaceId: "0", availableStartMs: 0, availableEndMs: 3_000 }],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const repository = {
      findLipSyncPreparation: vi.fn().mockResolvedValue(existing),
    } as unknown as PipelineRepository;
    const provider = { submitFaceAnalysis: vi.fn() } as unknown as LipSyncProvider;
    const service = new LipSyncPreparationService(
      repository,
      provider,
      { getCredential: vi.fn() } as unknown as GenerationCredentialReader,
      "runninghub:default",
    );

    await expect(service.create({
      nodeId: "node-1",
      projectId: "project-1",
      videoFingerprint: "fingerprint-1",
      video: { slot: "videoUrl", name: "person.mp4", mimeType: "video/mp4", data: new Uint8Array([1]) },
    })).resolves.toMatchObject({ id: "preparation-1", status: "ready" });
    expect(provider.submitFaceAnalysis).not.toHaveBeenCalled();
  });
});
