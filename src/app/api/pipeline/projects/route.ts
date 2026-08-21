import type {
  CreateProjectRequest,
  ProjectListResponse,
  ProjectResponse,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<ProjectListResponse>(async () => {
    const projects = await container.pipelineRepository.listProjects();
    const summaries = await Promise.all(
      projects.map(async (p) => {
        const stages = await container.pipelineRepository.getStageStatuses(p.id);
        const frames = await container.pipelineRepository.listFrames(p.id);
        return {
          id: p.id,
          title: p.title,
          rootPath: p.rootPath,
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
    if (!body.rootPath?.trim()) {
      throw new AppError("VALIDATION_ERROR", "Project folder is required", 400);
    }
    const id = crypto.randomUUID();
    return container.pipelineRepository.createProject({
      id,
      rootPath: body.rootPath.trim(),
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
