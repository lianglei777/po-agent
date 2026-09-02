import type { SessionContextResponse } from "@/contracts/sessions";
import { AppError } from "@/server/domain/app-error";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return protectedRoute<SessionContextResponse>(async () => {
    const { id } = await context.params;
    const leafId = new URL(request.url).searchParams.get("leafId");
    const sessionContext = await container.sessionService.getContext(id, leafId);
    if (!sessionContext) {
      throw new AppError(
        "SESSION_NOT_FOUND",
        `Session context for ${id} was not found`,
        404,
      );
    }
    return { context: sessionContext };
  });
}

