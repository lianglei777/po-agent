import type {
  ListContentGenerationProvidersResponse,
  SaveContentGenerationProviderResponse,
} from "@/contracts/content-generation";
import type { SuccessResponse } from "@/contracts/common";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseContentGenerationProvider } from "@/server/transport/http/content-generation-validators";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<ListContentGenerationProvidersResponse>(() =>
    container.contentGenerationService.listProviders(),
  );
}

export async function PUT(request: Request) {
  return handleRoute<SaveContentGenerationProviderResponse>(async () =>
    container.contentGenerationService.saveProvider(
      parseContentGenerationProvider(await readJson(request)),
    ),
  );
}

export async function DELETE(request: Request) {
  return handleRoute<SuccessResponse>(async () => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    await container.contentGenerationService.deleteProvider(id);
    return { success: true };
  });
}
