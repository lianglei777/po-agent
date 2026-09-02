import os from "node:os";
import type { HomeResponse } from "@/contracts/system";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<HomeResponse>(() => ({ home: os.homedir() }));
}

