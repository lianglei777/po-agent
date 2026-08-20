import type { CanvasWorkflow, CanvasWorkflowListResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<CanvasWorkflowListResponse>(async () => {
    const { id } = await context.params;
    return { workflows: await container.canvasStudioService.listWorkflows(id) };
  });
}

export async function POST(request: Request, context: Context) {
  return handleRoute<{ workflow: CanvasWorkflow }>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as { name?: string; description?: string; nodeIds?: string[] };
    const workflow = await container.canvasStudioService.saveWorkflow({ projectId: id, name: body.name ?? "", description: body.description, nodeIds: body.nodeIds ?? [] });
    return { workflow };
  });
}
