import { cookies } from "next/headers";
import { container } from "@/server/composition/container";
import {
  executeRoute,
  type RouteWork,
} from "@/server/transport/http/route-pipeline";

export { readJson } from "@/server/transport/http/api-response";

export const ACCESS_CONTROL_COOKIE_NAME = "po_agent_session";

export function protectedRoute<T>(work: RouteWork<T>): Promise<Response> {
  return executeRoute(work, {
    authorize: assertApiAccess,
    unexpectedErrorLogger: container.httpUnexpectedErrorLogger,
  });
}

export function publicRoute<T>(work: RouteWork<T>): Promise<Response> {
  return executeRoute(work, {
    unexpectedErrorLogger: container.httpUnexpectedErrorLogger,
  });
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_CONTROL_COOKIE_NAME)?.value;
}

async function assertApiAccess(): Promise<void> {
  await container.accessControlService.assertAuthorized(await sessionToken());
}
