import type {
  AssetListResponse,
  AssetResponse,
  CreateAssetRequest,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handleRoute<AssetListResponse>(async () => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as
      | "character"
      | "scene"
      | "prop"
      | null;
    const assets = await container.pipelineRepository.listAssets(
      id,
      type ?? undefined,
    );
    return { assets };
  });
}

export async function POST(request: Request, context: Context) {
  return handleRoute<AssetResponse>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as CreateAssetRequest;
    if (!body.name?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Asset name is required", 400);
    }
    if (!body.type) {
      throw new AppError("VALIDATION_ERROR", "Asset type is required", 400);
    }
    const assetId = crypto.randomUUID();
    const asset = await container.pipelineRepository.createAsset({
      id: assetId,
      projectId: id,
      type: body.type,
      name: body.name.trim(),
      description: body.description ?? "",
      attributes: null,
      selectedArtifactId: null,
      locked: false,
      starred: false,
      status: "pending",
    });
    if (body.positionX !== undefined && body.positionY !== undefined) {
      await container.pipelineRepository.createCanvasNode({
        id: crypto.randomUUID(), projectId: id, type: body.type,
        entityId: assetId, positionX: body.positionX, positionY: body.positionY,
      });
    }
    return asset;
  });
}
