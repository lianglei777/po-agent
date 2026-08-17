import type {
  AgentTurnResponse,
  AgentTurnSnapshotResponse,
} from "@/contracts/agent";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseAgentTurnRequest } from "@/server/transport/http/validators";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<AgentTurnSnapshotResponse>(async () => {
    const { id } = await context.params;
    const snapshot = await container.chatTurnService.getSnapshot(id);
    return {
      agent: snapshot.agent,
      generationRuns: snapshot.generationRuns.map(generationRunViewDto),
    };
  });
}

export async function POST(request: Request, context: Context) {
  return handleRoute<AgentTurnResponse>(async () => {
    const { id } = await context.params;
    const result = await container.chatTurnService.submit(
      id,
      parseAgentTurnRequest(await readJson(request)),
    );
    if (result.type === "accepted" && result.intent === "generation") {
      return { ...result, run: generationRunViewDto(result.run) };
    }
    return result;
  });
}
