import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute(async () => {
    const { nodeId } = await context.params;
    const media = await container.canvasStudioService.readNodeUploadSource(nodeId);
    return new Response(Uint8Array.from(media.data).buffer, {
      headers: { "Content-Type": media.mimeType, "Cache-Control": "private, max-age=3600" },
    });
  });
}
