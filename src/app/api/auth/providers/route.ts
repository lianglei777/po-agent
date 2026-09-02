import type { OAuthProvidersResponse } from "@/contracts/auth";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<OAuthProvidersResponse>(() =>
    container.authService.listOAuthProviders(),
  );
}

