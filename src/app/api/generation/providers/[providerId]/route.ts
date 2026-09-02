import type {
  GenerationProviderSettingsDto,
  UpdateGenerationEnabledRequest,
} from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";
import { asObject, requiredBoolean } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/generation/providers/[providerId]">,
) {
  return protectedRoute<GenerationProviderSettingsDto>(async () => {
    const { providerId } = await context.params;
    return container.generationProviderSettingsService.getProviderSettings(
      providerId,
    );
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/generation/providers/[providerId]">,
) {
  return protectedRoute<GenerationProviderSettingsDto>(async () => {
    const { providerId } = await context.params;
    const body = asObject(await readJson(request));
    const input: UpdateGenerationEnabledRequest = {
      enabled: requiredBoolean(body, "enabled"),
    };
    return container.generationProviderSettingsService.setProviderEnabled(
      providerId,
      input.enabled,
    );
  });
}
