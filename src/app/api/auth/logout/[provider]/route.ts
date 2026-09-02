import type { LogoutOAuthResponse } from "@/contracts/auth";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return protectedRoute<LogoutOAuthResponse>(async () => {
    const { provider } = await context.params;
    await container.authService.logout(provider);
    return { success: true };
  });
}

