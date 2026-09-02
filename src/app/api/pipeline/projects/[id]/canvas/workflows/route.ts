import type { CanvasWorkflow, CanvasWorkflowListResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<CanvasWorkflowListResponse>(async () => {
    const { id } = await context.params;
    return { workflows: await container.canvasStudioService.listWorkflows(id) };
  });
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<{ workflow: CanvasWorkflow }>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as { name?: string; description?: string; nodeIds?: string[] };
    const workflow = await container.canvasStudioService.saveWorkflow({ projectId: id, name: body.name ?? "", description: body.description, nodeIds: body.nodeIds ?? [] });
    return { workflow };
  });
}
