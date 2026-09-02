import type { AgentSettingsResponse } from "@/contracts/agent-settings";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseUpdateAgentSettings } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<AgentSettingsResponse>(() =>
    container.agentSettingsService.read(),
  );
}

export async function PATCH(request: Request) {
  return protectedRoute<AgentSettingsResponse>(async () =>
    container.agentSettingsService.update(
      parseUpdateAgentSettings(await readJson(request)),
    ),
  );
}
