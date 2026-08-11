import type { AgentSettingsResponse } from "@/contracts/agent-settings";
import { container } from "@/server/composition/container";
import {
  handleRoute,
  readJson,
} from "@/server/transport/http/api-response";
import { parseUpdateAgentSettings } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<AgentSettingsResponse>(() =>
    container.agentSettingsService.read(),
  );
}

export async function PATCH(request: Request) {
  return handleRoute<AgentSettingsResponse>(async () =>
    container.agentSettingsService.update(
      parseUpdateAgentSettings(await readJson(request)),
    ),
  );
}
