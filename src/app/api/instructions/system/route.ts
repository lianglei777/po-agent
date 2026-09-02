import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import {
  parseDeleteSystemInstructions,
  parseSaveSystemInstructions,
} from "@/server/transport/http/validators";
import type { SystemInstructionsResponse } from "@/contracts/instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return protectedRoute<SystemInstructionsResponse>(() =>
    container.instructionService.getSystem(),
  );
}

export async function PUT(request: Request) {
  return protectedRoute<SystemInstructionsResponse>(async () => {
    const body = parseSaveSystemInstructions(await readJson(request));
    return container.instructionService.saveSystem(
      body.content,
      body.expectedRevision,
      body.force,
    );
  });
}

export async function DELETE(request: Request) {
  return protectedRoute(async () => {
    const body = parseDeleteSystemInstructions(await readJson(request));
    await container.instructionService.deleteSystem(
      body.expectedRevision,
      body.force,
    );
    return new Response(null, { status: 204 });
  });
}
