import type {
  ModelsConfigResponse,
  SaveModelsConfigResponse,
} from "@/contracts/models";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseModelsConfig } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<ModelsConfigResponse>(() =>
    container.modelService.readConfig(),
  );
}

export async function PUT(request: Request) {
  return protectedRoute<SaveModelsConfigResponse>(async () => {
    await container.modelService.writeConfig(
      parseModelsConfig(await readJson(request)),
    );
    return { success: true };
  });
}

