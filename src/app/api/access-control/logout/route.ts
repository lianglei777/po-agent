import type { AccessControlSessionResponse } from "@/contracts/access-control";
import { publicRoute, sessionToken } from "@/app/api/_route";
import { clearAccessControlSessionCookie } from "@/app/api/access-control/_cookie";
import { container } from "@/server/composition/container";

export const runtime = "nodejs";

export async function POST() {
  return publicRoute<AccessControlSessionResponse>(async () => {
    container.accessControlService.logout(await sessionToken());
    await clearAccessControlSessionCookie();
    return { state: "login-required" };
  });
}
