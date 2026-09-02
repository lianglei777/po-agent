import type { ModelDiscoveryResponse } from "@/contracts/models";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseModelDiscovery } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return protectedRoute<ModelDiscoveryResponse>(async () =>
    container.modelService.discoverModels(
      parseModelDiscovery(await readJson(request)),
    ),
  );
}
