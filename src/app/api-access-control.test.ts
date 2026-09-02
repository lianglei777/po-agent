import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.resolve(process.cwd(), "src", "app", "api");

describe("API route pipeline boundary", () => {
  it("routes every endpoint through the explicit public or protected pipeline", async () => {
    const routes = await findRouteFiles(apiRoot);
    const violations: string[] = [];

    for (const route of routes) {
      const relative = path.relative(apiRoot, route).replaceAll("\\", "/");
      const source = await fs.readFile(route, "utf8");
      const importsPipeline = source.includes('from "@/app/api/_route"') ||
        source.includes("from '@/app/api/_route'");
      const usesPublicRoute = source.includes("publicRoute");
      const usesProtectedRoute = source.includes("protectedRoute");
      const bypassesPipeline = source.includes("_access") ||
        source.includes("apiAccessError") ||
        source.includes("errorResponse") ||
        source.includes("server/transport/http/api-response");
      const accessControlRoute = relative.startsWith("access-control/");
      if (
        !importsPipeline ||
        bypassesPipeline ||
        (accessControlRoute ? !usesPublicRoute : !usesProtectedRoute) ||
        (!accessControlRoute && usesPublicRoute)
      ) {
        violations.push(relative);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps authentication cookies server-only and same-site", async () => {
    const source = await fs.readFile(
      path.join(apiRoot, "access-control", "_cookie.ts"),
      "utf8",
    );
    expect(source).toContain("httpOnly: true");
    expect(source).toContain('sameSite: "strict"');
    expect(source).toContain('get("x-forwarded-proto")');
  });
});

async function findRouteFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return findRouteFiles(target);
    return entry.isFile() && entry.name === "route.ts" ? [target] : [];
  }));
  return nested.flat();
}
