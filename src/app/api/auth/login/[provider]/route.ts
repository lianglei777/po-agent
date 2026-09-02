import type {
  OAuthInputRequest,
  OAuthInputResponse,
  OAuthServerEvent,
} from "@/contracts/auth";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import {
  asObject,
  requiredString,
} from "@/server/transport/http/validators";
import { createSseResponse } from "@/server/transport/sse/sse-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: Context) {
  return protectedRoute(async () => {
    const { provider } = await context.params;
    return createSseResponse<OAuthServerEvent>({
      request,
      eventName: "oauth",
      subscribe: async (emit, signal) => {
        void container.authService
          .startOAuth(provider, emit, signal)
          .catch((error) => {
            emit({
              type: "error",
              message:
                error instanceof Error ? error.message : String(error),
            });
          });
        return () => {};
      },
    });
  });
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<OAuthInputResponse>(async () => {
    const { provider } = await context.params;
    const body = asObject(await readJson(request));
    const input: OAuthInputRequest = {
      token: requiredString(body, "token"),
      value: requiredString(body, "value"),
    };
    container.authService.submitInput(
      provider,
      input.token,
      input.value,
    );
    return { success: true };
  });
}
