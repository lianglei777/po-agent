import type {
  PlanGenerationTurnRequest,
  PlanGenerationTurnResponse,
} from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";
import { parsePlanGenerationTurnRequest } from "@/server/transport/http/generation-validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<PlanGenerationTurnResponse>(async () => {
    const input: PlanGenerationTurnRequest = parsePlanGenerationTurnRequest(
      await readJson(request),
    );
    return container.planComposerGenerationTurn(input);
  });
}
