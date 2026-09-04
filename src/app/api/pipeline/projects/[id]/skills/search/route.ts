import type { PipelineSkillSearchResponse } from "@/contracts/pipeline-agent";
import { protectedRoute, readJson } from "@/app/api/_route";
import { container } from "@/server/composition/container";
import { asObject, requiredString } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<PipelineSkillSearchResponse>(async () => {
    const body = asObject(await readJson(request));
    return { results: await container.pipelineSkillService.search(requiredString(body, "query"), 20) };
  });
}
