import type { SkillPackLoadResponse } from "@/contracts/skill-packs";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseSkillPackInstall } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<SkillPackLoadResponse>(async () =>
    container.skillPackService.install(
      parseSkillPackInstall(await readJson(request)),
    ),
  );
}
