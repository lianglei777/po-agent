import type {
  GenerationProviderSettingsDto,
  UpdateGenerationEnabledRequest,
} from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { asObject, requiredBoolean } from "@/server/transport/http/validators";

export const runtime = "nodejs";
const PROVIDER_ID = "runninghub";

export async function GET() {
  return handleRoute<GenerationProviderSettingsDto>(() =>
    container.generationRunService.getProviderSettings(PROVIDER_ID));
}

export async function PATCH(request: Request) {
  return handleRoute<GenerationProviderSettingsDto>(async () => {
    const body = asObject(await readJson(request));
    const input: UpdateGenerationEnabledRequest = {
      enabled: requiredBoolean(body, "enabled"),
    };
    return container.generationRunService.setProviderEnabled(PROVIDER_ID, input.enabled);
  });
}
