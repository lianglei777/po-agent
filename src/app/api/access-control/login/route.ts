import type {
  AccessControlLoginRequest,
  AccessControlSessionResponse,
} from "@/contracts/access-control";
import { setAccessControlSessionCookie } from "@/app/api/access-control/_cookie";
import { publicRoute, readJson } from "@/app/api/_route";
import { container } from "@/server/composition/container";
import { asObject, requiredString } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return publicRoute<AccessControlSessionResponse>(async () => {
    const body = parseLoginRequest(await readJson(request));
    const result = await container.accessControlService.login(
      body.password,
      clientKey(request),
    );
    if (result.token) await setAccessControlSessionCookie(request, result.token);
    return result.session;
  });
}

function parseLoginRequest(value: unknown): AccessControlLoginRequest {
  return { password: requiredString(asObject(value), "password") };
}

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || "direct";
}
