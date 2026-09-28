import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";
import { pipelineMediaResponse } from "@/server/transport/http/pipeline-media-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string; runId: string; artifactId: string }> };

export async function GET(request: Request, context: Context) {
  return protectedRoute(async () => {
    const { nodeId, runId, artifactId } = await context.params;
    const media = await container.canvasStudioService.openNodeGenerationArtifact(nodeId, runId, artifactId);
    return pipelineMediaResponse(request, media);
  });
}
