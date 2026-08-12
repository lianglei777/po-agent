import type { WebAccessSettingsResponse } from "@/contracts/web-access";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseUpdateWebAccessSettings } from "@/server/transport/http/validators";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  const response = await handleRoute<WebAccessSettingsResponse>(() =>
    container.webAccessSettingsService.read(),
  );
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return response;
}

export async function PUT(request: Request) {
  const response = await handleRoute<WebAccessSettingsResponse>(async () =>
    container.webAccessSettingsService.update(
      parseUpdateWebAccessSettings(await readJson(request)),
    ),
  );
  response.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
  return response;
}
