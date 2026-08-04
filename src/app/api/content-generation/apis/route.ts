import type {
  ListContentGenerationApisResponse,
  SaveContentGenerationApiResponse,
} from "@/contracts/content-generation";
import type { SuccessResponse } from "@/contracts/common";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseContentGenerationApi } from "@/server/transport/http/content-generation-validators";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<ListContentGenerationApisResponse>(() =>
    container.contentGenerationService.listApis(),
  );
}

export async function PUT(request: Request) {
  return handleRoute<SaveContentGenerationApiResponse>(async () =>
    container.contentGenerationService.saveApi(
      parseContentGenerationApi(await readJson(request)),
    ),
  );
}

export async function DELETE(request: Request) {
  return handleRoute<SuccessResponse>(async () => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    await container.contentGenerationService.deleteApi(id);
    return { success: true };
  });
}
