import type {
  DeleteSessionResponse,
  RenameSessionResponse,
  SessionDetailResponse,
} from "@/contracts/sessions";
import { AppError } from "@/server/domain/app-error";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import {
  asObject,
  requiredString,
} from "@/server/transport/http/validators";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return protectedRoute<SessionDetailResponse>(async () => {
    const { id } = await context.params;
    const includeRuntimeState =
      new URL(request.url).searchParams.get("includeState") === "true";
    const detail = await container.sessionService.get(id, {
      includeRuntimeState,
    });
    if (!detail) {
      throw new AppError(
        "SESSION_NOT_FOUND",
        `Session ${id} was not found`,
        404,
      );
    }
    const { agentState, ...rest } = detail;
    return agentState
      ? {
          ...rest,
          agentState: {
            running: agentState.loaded,
            state: agentState.state,
          },
        }
      : rest;
  });
}

export async function PATCH(request: Request, context: Context) {
  return protectedRoute<RenameSessionResponse>(async () => {
    const { id } = await context.params;
    const body = asObject(await readJson(request));
    await container.sessionService.rename(id, requiredString(body, "name"));
    return { success: true };
  });
}

export async function DELETE(_request: Request, context: Context) {
  return protectedRoute<DeleteSessionResponse>(async () => {
    const { id } = await context.params;
    await container.sessionService.delete(id);
    return { success: true };
  });
}

