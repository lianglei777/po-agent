import type { AccessControlSessionResponse } from "@/contracts/access-control";
import { publicRoute, sessionToken } from "@/app/api/_route";
import { container } from "@/server/composition/container";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return publicRoute<AccessControlSessionResponse>(async () =>
    container.accessControlService.getSession(await sessionToken()),
  );
}
