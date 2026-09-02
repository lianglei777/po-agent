import type {
  AddProjectResponse,
  ListProjectsResponse,
  RemoveProjectResponse,
} from "@/contracts/projects";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseProjectPath } from "@/server/transport/http/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return protectedRoute<ListProjectsResponse>(() =>
    container.projectService.list(),
  );
}

export function POST(request: Request) {
  return protectedRoute<AddProjectResponse>(async () => {
    const { path } = parseProjectPath(await readJson(request));
    return container.projectService.add(path);
  });
}

export function DELETE(request: Request) {
  return protectedRoute<RemoveProjectResponse>(() => {
    const value = new URL(request.url).searchParams.get("path")?.trim();
    if (!value) {
      throw new AppError("VALIDATION_ERROR", "path is required", 400);
    }
    return container.projectService.remove(value);
  });
}
