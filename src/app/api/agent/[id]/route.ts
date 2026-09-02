import type {
  AgentCommandResponse,
  AgentRuntimeResponse,
} from "@/contracts/agent";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseAgentCommand } from "@/server/transport/http/validators";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<AgentRuntimeResponse>(async () => {
    const { id } = await context.params;
    const snapshot = await container.agentService.getSnapshot(id);
    return { running: snapshot.loaded, state: snapshot.state };
  });
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<AgentCommandResponse>(async () => {
    const { id } = await context.params;
    return container.agentService.execute(
      id,
      parseAgentCommand(await readJson(request)),
    );
  });
}
