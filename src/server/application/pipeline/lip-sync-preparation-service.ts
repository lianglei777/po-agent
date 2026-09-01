import { randomUUID } from "node:crypto";
import type { LipSyncPreparationDto } from "@/contracts/pipeline";
import { AppError } from "@/server/domain/app-error";
import type { LipSyncPreparation } from "@/server/domain/pipeline";
import type { GenerationCredentialReader } from "@/server/ports/generation-provider";
import type { LipSyncProvider } from "@/server/ports/lip-sync-provider";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { ProviderInputAsset } from "@/server/ports/generation-provider";

export class LipSyncPreparationService {
  constructor(
    private readonly repository: PipelineRepository,
    private readonly provider: LipSyncProvider,
    private readonly credentials: GenerationCredentialReader,
    private readonly credentialRef: string,
  ) {}

  async create(input: {
    nodeId: string;
    projectId: string;
    videoFingerprint: string;
    video: ProviderInputAsset;
  }): Promise<LipSyncPreparationDto> {
    const existing = await this.repository.findLipSyncPreparation(input.nodeId, input.videoFingerprint);
    if (existing && existing.status !== "failed") return this.refresh(existing);

    const credential = await this.requireCredential();
    const submitted = await this.provider.submitFaceAnalysis({ video: input.video, credential });
    const preparation = await this.repository.createLipSyncPreparation({
      id: randomUUID(),
      nodeId: input.nodeId,
      projectId: input.projectId,
      videoFingerprint: input.videoFingerprint,
      providerSessionId: submitted.providerSessionId,
      remoteTaskId: submitted.remoteTaskId,
      status: submitted.state === "ready" ? "ready" : submitted.state === "failed" ? "failed" : "analyzing",
      faces: submitted.faces ?? [],
      errorMessage: submitted.errorMessage,
    });
    return toDto(preparation);
  }

  async get(id: string, nodeId: string): Promise<LipSyncPreparationDto> {
    const preparation = await this.requirePreparation(id, nodeId);
    return this.refresh(preparation);
  }

  async requireReady(id: string, nodeId: string, videoFingerprint: string, faceKey: string) {
    const preparation = await this.requirePreparation(id, nodeId);
    if (preparation.videoFingerprint !== videoFingerprint) {
      throw new AppError("VALIDATION_ERROR", "The selected face analysis belongs to a different video", 409);
    }
    if (preparation.status !== "ready" || !preparation.providerSessionId) {
      throw new AppError("VALIDATION_ERROR", "Face analysis is not ready", 409);
    }
    const face = preparation.faces.find((candidate) => candidate.key === faceKey);
    if (!face) throw new AppError("VALIDATION_ERROR", "The selected face was not found", 400);
    return { preparation, face };
  }

  private async refresh(preparation: LipSyncPreparation): Promise<LipSyncPreparationDto> {
    if (preparation.status !== "analyzing" || !preparation.remoteTaskId) return toDto(preparation);
    const credential = await this.requireCredential();
    const result = await this.provider.pollFaceAnalysis({
      remoteTaskId: preparation.remoteTaskId,
      credential,
    });
    if (result.state === "pending") return toDto(preparation);
    const updated = await this.repository.updateLipSyncPreparation(preparation.id, {
      providerSessionId: result.providerSessionId,
      remoteTaskId: result.remoteTaskId ?? preparation.remoteTaskId,
      status: result.state === "ready" ? "ready" : "failed",
      faces: result.faces ?? [],
      errorMessage: result.errorMessage,
    });
    if (!updated) throw new AppError("FILE_NOT_FOUND", "Lip-sync preparation was not found", 404);
    return toDto(updated);
  }

  private async requirePreparation(id: string, nodeId: string) {
    const preparation = await this.repository.getLipSyncPreparation(id);
    if (!preparation || preparation.nodeId !== nodeId) {
      throw new AppError("FILE_NOT_FOUND", "Lip-sync preparation was not found", 404);
    }
    return preparation;
  }

  private async requireCredential() {
    const credential = await this.credentials.getCredential(this.credentialRef);
    if (!credential) throw new AppError("GENERATION_CREDENTIAL_NOT_FOUND", "RunningHub credential is not configured", 400);
    return credential;
  }
}

function toDto(preparation: LipSyncPreparation): LipSyncPreparationDto {
  const recommended = preparation.faces.reduce<typeof preparation.faces[number] | undefined>((longest, face) => (
    !longest || face.availableEndMs - face.availableStartMs > longest.availableEndMs - longest.availableStartMs
      ? face
      : longest
  ), undefined);
  return {
    id: preparation.id,
    nodeId: preparation.nodeId,
    status: preparation.status,
    faces: preparation.faces.map((face) => ({
      key: face.key,
      previewUrl: face.previewUrl,
      availableStartMs: face.availableStartMs,
      availableEndMs: face.availableEndMs,
      recommended: face.key === recommended?.key,
    })),
    errorMessage: preparation.errorMessage,
    createdAt: preparation.createdAt,
    updatedAt: preparation.updatedAt,
  };
}
