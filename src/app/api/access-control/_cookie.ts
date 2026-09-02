import { cookies } from "next/headers";
import { ACCESS_CONTROL_COOKIE_NAME } from "@/app/api/_route";

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export async function setAccessControlSessionCookie(
  request: Request,
  token: string,
): Promise<void> {
  (await cookies()).set(ACCESS_CONTROL_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: requestIsHttps(request),
  });
}

export async function clearAccessControlSessionCookie(): Promise<void> {
  (await cookies()).delete(ACCESS_CONTROL_COOKIE_NAME);
}

function requestIsHttps(request: Request): boolean {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  return forwardedProtocol === "https" || new URL(request.url).protocol === "https:";
}
