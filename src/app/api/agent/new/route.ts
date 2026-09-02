import type { CreateAgentResponse } from "@/contracts/agent";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseCreateAgent } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<CreateAgentResponse>(async () =>
    container.agentService.create(
      parseCreateAgent(await readJson(request)),
    ),
  );
}
