import type {
  CreateProjectRequest,
  ProjectListResponse,
  ProjectResponse,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute<ProjectListResponse>(async () => {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "default";
    const projects = await container.pipelineRepository.listProjects(workspaceId);
    const summaries = await Promise.all(
      projects.map(async (p) => {
        const stages = await container.pipelineRepository.getStageStatuses(p.id);
        const frames = await container.pipelineRepository.listFrames(p.id);
        return {
          id: p.id,
          title: p.title,
          status: p.status,
          stageStatuses: stages,
          frameCount: frames.length,
          updatedAt: p.updatedAt,
        };
      }),
    );
    return { projects: summaries };
  });
}

export async function POST(request: Request) {
  return handleRoute<ProjectResponse>(async () => {
    const body = (await readJson(request)) as CreateProjectRequest;
    if (!body.title?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Project title is required", 400);
    }
    if (!body.workspaceId?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Workspace ID is required", 400);
    }
    const id = crypto.randomUUID();
    return container.pipelineRepository.createProject({
      id,
      workspaceId: body.workspaceId,
      title: body.title.trim(),
      originalText: body.originalText ?? "",
      artDirection: body.artDirection ? { selectedStyleId: body.artDirection, styleConfig: {}, customStyles: [], aiRecommendations: [] } as never : null,
      modelSettings: null,
      promptConfig: null,
      status: "draft",
      coverArtifactId: null,
    });
  });
}
