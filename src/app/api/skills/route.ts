import type {
  RemoveSkillResponse,
  SetSkillInvocationRequest,
  SkillLoadResponse,
} from "@/contracts/skills";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import {
  asObject,
  requiredBoolean,
  requiredString,
  optionalString,
  parseSkillRemove,
} from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return protectedRoute<SkillLoadResponse>(() => {
    const cwd = new URL(request.url).searchParams.get("cwd") ?? "";
    return container.skillService.load(cwd);
  });
}

export async function PATCH(request: Request) {
  return protectedRoute<SkillLoadResponse>(async () => {
    const body = asObject(await readJson(request));
    const input: SetSkillInvocationRequest = {
      cwd: requiredString(body, "cwd"),
      skillId: requiredString(body, "skillId"),
      disabled: requiredBoolean(body, "disabled"),
      expectedVersion: optionalString(body, "expectedVersion"),
    };
    return container.skillService.setModelInvocationDisabled(input);
  });
}

export async function DELETE(request: Request) {
  return protectedRoute<RemoveSkillResponse>(async () =>
    container.skillService.remove(
      parseSkillRemove(await readJson(request)),
    ),
  );
}
