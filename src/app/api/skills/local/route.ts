import type { CreateLocalSkillResponse } from "@/contracts/skills";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseSkillCreateLocal } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<CreateLocalSkillResponse>(async () =>
    container.skillService.importLocal(
      parseSkillCreateLocal(await readJson(request)),
    ),
  );
}
