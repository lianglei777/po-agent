import type {
  ApiKeyStatusResponse,
  RemoveApiKeyResponse,
  SaveApiKeyRequest,
  SaveApiKeyResponse,
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

export const runtime = "nodejs";

type Context = { params: Promise<{ provider: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<ApiKeyStatusResponse>(async () => {
    const { provider } = await context.params;
    return container.authService.getApiKeyStatus(provider);
  });
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<SaveApiKeyResponse>(async () => {
    const { provider } = await context.params;
    const body = asObject(await readJson(request));
    const input: SaveApiKeyRequest = {
      apiKey: requiredString(body, "apiKey"),
    };
    await container.authService.setApiKey(provider, input.apiKey);
    return { success: true };
  });
}

export async function DELETE(_request: Request, context: Context) {
  return protectedRoute<RemoveApiKeyResponse>(async () => {
    const { provider } = await context.params;
    await container.authService.removeApiKey(provider);
    return { success: true };
  });
}

