import type {
  AccessControlSettingsResponse,
  UpdateAccessControlSettingsRequest,
} from "@/contracts/access-control";
import { publicRoute, readJson, sessionToken } from "@/app/api/_route";
import { clearAccessControlSessionCookie } from "@/app/api/access-control/_cookie";
import { container } from "@/server/composition/container";
import {
  asObject,
  requiredBoolean,
  requiredString,
} from "@/server/transport/http/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return publicRoute<AccessControlSettingsResponse>(() =>
    container.accessControlService.getSettings(),
  );
}

export async function PUT(request: Request) {
  return publicRoute<AccessControlSettingsResponse>(async () => {
    const body = parseSettingsRequest(await readJson(request));
    const settings = await container.accessControlService.updateEnabled({
      token: await sessionToken(),
      ...body,
    });
    await clearAccessControlSessionCookie();
    return settings;
  });
}

function parseSettingsRequest(value: unknown): UpdateAccessControlSettingsRequest {
  const body = asObject(value);
  return {
    enabled: requiredBoolean(body, "enabled"),
    currentPassword: requiredString(body, "currentPassword"),
  };
}
