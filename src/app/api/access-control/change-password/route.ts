import type {
  AccessControlChangePasswordRequest,
  AccessControlSessionResponse,
} from "@/contracts/access-control";
import { publicRoute, readJson, sessionToken } from "@/app/api/_route";
import { clearAccessControlSessionCookie } from "@/app/api/access-control/_cookie";
import { container } from "@/server/composition/container";
import { asObject, requiredString } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return publicRoute<AccessControlSessionResponse>(async () => {
    const body = parseChangePasswordRequest(await readJson(request));
    await container.accessControlService.changePassword({
      token: await sessionToken(),
      ...body,
    });
    await clearAccessControlSessionCookie();
    return { state: "login-required" };
  });
}

function parseChangePasswordRequest(
  value: unknown,
): AccessControlChangePasswordRequest {
  const body = asObject(value);
  return {
    currentPassword: requiredString(body, "currentPassword"),
    newPassword: requiredString(body, "newPassword"),
  };
}
