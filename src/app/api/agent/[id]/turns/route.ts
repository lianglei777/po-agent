import type {
  AgentTurnResponse,
  AgentTurnSnapshotResponse,
} from "@/contracts/agent";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";
import { parseAgentTurnRequest } from "@/server/transport/http/validators";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<AgentTurnSnapshotResponse>(async () => {
    const { id } = await context.params;
    const snapshot = await container.chatTurnService.getSnapshot(id);
    return {
      agent: snapshot.agent,
      generationRuns: snapshot.generationRuns.map(generationRunViewDto),
    };
  });
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<AgentTurnResponse>(async () => {
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
