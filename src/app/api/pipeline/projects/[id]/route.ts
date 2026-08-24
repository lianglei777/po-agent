import type {
  ProjectResponse,
  UpdateProjectRequest,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<ProjectResponse>(async () => {
    const { id } = await context.params;
    const project = await container.pipelineRepository.getProject(id);
    if (!project) {
      throw new AppError("PIPELINE_PROJECT_NOT_FOUND", `Project ${id} was not found`, 404);
    }
    return project;
  });
}

export async function PATCH(request: Request, context: Context) {
  return handleRoute<ProjectResponse>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as UpdateProjectRequest;
    const updated = await container.pipelineRepository.updateProject(id, body);
    if (!updated) {
      throw new AppError("PIPELINE_PROJECT_NOT_FOUND", `Project ${id} was not found`, 404);
    }
    return updated;
  });
}

export async function DELETE(_request: Request, context: Context) {
  return handleRoute<{ success: true }>(async () => {
    const { id } = await context.params;
    const deleted = await container.pipelineRepository.deleteProject(id);
    if (!deleted) {
      throw new AppError("PIPELINE_PROJECT_NOT_FOUND", `Project ${id} was not found`, 404);
    }
    return { success: true };
  });
}
