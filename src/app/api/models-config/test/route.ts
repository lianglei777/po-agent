import type { ModelTestResponse } from "@/contracts/models";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseModelTest } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<ModelTestResponse>(async () =>
    container.modelService.testConfig(
      parseModelTest(await readJson(request)),
    ),
  );
}
