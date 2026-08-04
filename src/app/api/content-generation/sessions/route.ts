import type { CreateContentGenerationSessionResponse } from "@/contracts/content-generation";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { asObject, requiredString } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute<CreateContentGenerationSessionResponse>(async () => {
    const body = asObject(await readJson(request));
    return container.contentGenerationService.createSession({
      cwd: requiredString(body, "cwd"),
      apiId: requiredString(body, "apiId"),
    });
  });
}
