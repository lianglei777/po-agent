import type {
  CreateFrameRequest,
  FrameListResponse,
  FrameResponse,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<FrameListResponse>(async () => {
    const { id } = await context.params;
    const frames = await container.pipelineRepository.listFrames(id);
    return { frames };
  });
}

export async function POST(request: Request, context: Context) {
  return handleRoute<FrameResponse>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as CreateFrameRequest;
    const existing = await container.pipelineRepository.listFrames(id);
    const frameId = crypto.randomUUID();
    const frame = await container.pipelineRepository.createFrame({
      id: frameId,
      projectId: id,
      sceneId: body.sceneId ?? null,
      characterIds: body.characterIds ?? [],
      propIds: body.propIds ?? [],
      index: existing.length,
      visualDescription: body.visualDescription ?? null,
      dialogueStructured: null,
      cameraMovement: null,
      blocking: null,
      lighting: null,
      audioNote: null,
      shotSize: body.shotSize ?? null,
      transitionHint: null,
      imagePrompt: null,
      videoPrompt: null,
      selectedImageArtifactId: null,
      finalTakeRunId: null,
      locked: false,
      status: "pending",
    });
    if (body.positionX !== undefined && body.positionY !== undefined) {
      await container.pipelineRepository.createCanvasNode({
        id: crypto.randomUUID(), projectId: id, type: "storyboard",
        entityId: frameId, positionX: body.positionX, positionY: body.positionY,
      });
    }
    return frame;
  });
}
