import { container } from "@/server/composition/container";
import { errorResponse } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { nodeId } = await context.params;
    const media = await container.canvasStudioService.readNodeUploadSource(nodeId);
    return new Response(Uint8Array.from(media.data).buffer, {
      headers: { "Content-Type": media.mimeType, "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
