import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import {
  parseDeleteProjectInstructions,
  parseSaveProjectInstructions,
} from "@/server/transport/http/validators";
import type { ProjectInstructionsResponse } from "@/contracts/instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return protectedRoute<ProjectInstructionsResponse>(() => {
    const cwd = new URL(request.url).searchParams.get("cwd");
    if (!cwd) {
      throw new AppError("VALIDATION_ERROR", "Query parameter 'cwd' is required", 400);
    }
    return container.instructionService.getProject(cwd);
  });
}

export async function PUT(request: Request) {
  return protectedRoute<ProjectInstructionsResponse>(async () => {
    const body = parseSaveProjectInstructions(await readJson(request));
    return container.instructionService.saveProject(
      body.cwd,
      body.content,
      body.expectedRevision,
      body.force,
    );
  });
}

export async function DELETE(request: Request) {
  return protectedRoute(async () => {
    const body = parseDeleteProjectInstructions(await readJson(request));
    await container.instructionService.deleteProject(
      body.cwd,
      body.expectedRevision,
      body.force,
    );
    return new Response(null, { status: 204 });
  });
}
