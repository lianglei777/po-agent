import type {
  PlanGenerationTurnRequest,
  PlanGenerationTurnResponse,
} from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parsePlanGenerationTurnRequest } from "@/server/transport/http/generation-validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute<PlanGenerationTurnResponse>(async () => {
    const input: PlanGenerationTurnRequest = parsePlanGenerationTurnRequest(
      await readJson(request),
    );
    return container.planComposerGenerationTurn(input);
  });
}
