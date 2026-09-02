import type { BrowseProjectsResponse } from "@/contracts/projects";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("path")?.trim();
  return protectedRoute<BrowseProjectsResponse>(() =>
    container.projectService.browse(value || undefined),
  );
}
