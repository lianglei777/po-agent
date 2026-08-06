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

const CREDENTIAL_REF = "runninghub:default";

export async function GET() {
  return handleRoute<GenerationCredentialStatusResponse>(async () => ({
    hasCredential: await container.generationCredentialStore.hasCredential(
      CREDENTIAL_REF,
    ),
  }));
}

export async function PUT(request: Request) {
  return handleRoute<GenerationCredentialStatusResponse>(async () => {
    const body = asObject(await readJson(request));
    const input: SaveGenerationCredentialRequest = {
      apiKey: requiredString(body, "apiKey"),
    };
    await container.generationCredentialStore.setCredential(
      CREDENTIAL_REF,
      input.apiKey,
    );
    return { hasCredential: true };
  });
}

export async function DELETE() {
  return handleRoute<GenerationCredentialStatusResponse>(async () => {
    await container.generationCredentialStore.setCredential(CREDENTIAL_REF, "");
    return {
      hasCredential: await container.generationCredentialStore.hasCredential(
        CREDENTIAL_REF,
      ),
    };
  });
}
