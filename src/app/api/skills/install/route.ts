import type { InstallSkillResponse } from "@/contracts/skills";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseSkillInstall } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<InstallSkillResponse>(async () =>
    container.skillService.install(
      parseSkillInstall(await readJson(request)),
    ),
  );
}
