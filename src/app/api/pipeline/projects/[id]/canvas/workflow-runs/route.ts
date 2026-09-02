import type {
  CanvasWorkflowRunListResponse,
  CanvasWorkflowRunResponse,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";
import { parseCreateCanvasWorkflowRunRequest } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return protectedRoute<CanvasWorkflowRunListResponse>(async () => {
    const { id } = await context.params;
    const requestedLimit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
    const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 20;
    return { workflowRuns: await container.canvasWorkflowRunService.list(id, limit) };
  });
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<CanvasWorkflowRunResponse>(async () => {
    const { id } = await context.params;
    const body = parseCreateCanvasWorkflowRunRequest(await readJson(request));
    return { workflowRun: await container.canvasWorkflowRunService.create({ projectId: id, nodeIds: body.nodeIds }) };
  });
}
