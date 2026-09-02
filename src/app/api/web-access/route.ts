import type { WebAccessSettingsResponse } from "@/contracts/web-access";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";
import { parseUpdateWebAccessSettings } from "@/server/transport/http/validators";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  return protectedRoute<WebAccessSettingsResponse | Response>(async () =>
    Response.json(await container.webAccessSettingsService.read(), {
      headers: NO_STORE_HEADERS,
    }),
  );
}

export async function PUT(request: Request) {
  return protectedRoute<WebAccessSettingsResponse | Response>(async () =>
    Response.json(
      await container.webAccessSettingsService.update(
        parseUpdateWebAccessSettings(await readJson(request)),
      ),
      { headers: NO_STORE_HEADERS },
    ),
  );
}
