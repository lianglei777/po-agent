import type { ListSessionsResponse } from "@/contracts/sessions";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<ListSessionsResponse>(() =>
    container.sessionService.list(),
  );
}

