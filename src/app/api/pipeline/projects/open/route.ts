import type { OpenPipelineProjectRequest, ProjectResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute<ProjectResponse>(async () => {
    const body = (await readJson(request)) as OpenPipelineProjectRequest;
    if (!body.rootPath?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Project folder is required", 400);
    }
    return container.pipelineRepository.openProject(body.rootPath.trim());
  });
}
