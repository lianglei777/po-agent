import { protectedRoute } from "@/app/api/_route";
import { container } from "@/server/composition/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ artifactId: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute(async () => {
    const { artifactId } = await context.params;
    const media = await container.generationAssetService.readArtifact(artifactId);
    return new Response(Uint8Array.from(media.data).buffer, {
      headers: {
        "Content-Type": media.mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
