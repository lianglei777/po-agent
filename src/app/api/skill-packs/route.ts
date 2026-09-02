import type { SkillPackLoadResponse } from "@/contracts/skill-packs";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseSkillPackRemove } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return protectedRoute<SkillPackLoadResponse>(() => {
    const cwd = new URL(request.url).searchParams.get("cwd") ?? "";
    return container.skillPackService.list(cwd);
  });
}

export async function DELETE(request: Request) {
  return protectedRoute<SkillPackLoadResponse>(async () =>
    container.skillPackService.remove(
      parseSkillPackRemove(await readJson(request)),
    ),
  );
}
