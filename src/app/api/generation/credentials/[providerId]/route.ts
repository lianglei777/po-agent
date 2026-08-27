import type {
  GenerationCredentialStatusResponse,
  SaveGenerationCredentialRequest,
} from "@/contracts/generation";
import { container } from "@/server/composition/container";
import {
  handleRoute,
  readJson,
} from "@/server/transport/http/api-response";
import {
  asObject,
  requiredString,
} from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/generation/credentials/[providerId]">,
) {
  return handleRoute<GenerationCredentialStatusResponse>(async () => {
    const { providerId } = await context.params;
    return container.generationProviderSettingsService.getCredentialStatus(
      providerId,
    );
  });
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/generation/credentials/[providerId]">,
) {
  return handleRoute<GenerationCredentialStatusResponse>(async () => {
    const { providerId } = await context.params;
    const body = asObject(await readJson(request));
    const input: SaveGenerationCredentialRequest = {
      apiKey: requiredString(body, "apiKey"),
    };
    return container.generationProviderSettingsService.setCredential(
      providerId,
      input.apiKey,
    );
  });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/generation/credentials/[providerId]">,
) {
  return handleRoute<GenerationCredentialStatusResponse>(async () => {
    const { providerId } = await context.params;
    return container.generationProviderSettingsService.setCredential(
      providerId,
      "",
    );
  });
}
