import type { AllAuthProvidersResponse } from "@/contracts/auth";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<AllAuthProvidersResponse>(async () => ({
    oauth: await container.authService.listOAuthProviders(),
    apiKey: await container.authService.listApiKeyProviders(),
  }));
}

