import { describe, expect, it } from "vitest";
import type { GenerationProviderDescriptorDto, GenerationRouteDto } from "@/contracts/generation";
import {
  contentGenerationSelectionFromKey,
  contentGenerationSelectionKey,
  groupGenerationRoutesByProduct,
  reconcileContentGenerationSelection,
} from "./content-generation-settings-model";

const providers: GenerationProviderDescriptorDto[] = [
  { providerId: "runninghub", displayName: "RunningHub", enabled: true },
];
const routes = [
  { id: "route-a", providerId: "runninghub", product: "Wan", name: "A" },
  { id: "route-b", providerId: "runninghub", product: "Flux", name: "B" },
  { id: "route-c", providerId: "runninghub", product: "Wan", name: "C" },
] as GenerationRouteDto[];

describe("content generation settings model", () => {
  it("round-trips selectable resource keys", () => {
    expect(contentGenerationSelectionFromKey("provider:runninghub")).toEqual({ type: "provider", providerId: "runninghub" });
    expect(contentGenerationSelectionKey({ type: "route", routeId: "route-a" })).toBe("route:route-a");
    expect(contentGenerationSelectionFromKey("product:runninghub:Wan")).toBeNull();
  });

  it("keeps a valid selection and otherwise selects the first provider", () => {
    expect(reconcileContentGenerationSelection(providers, routes, { type: "route", routeId: "route-b" }))
      .toEqual({ type: "route", routeId: "route-b" });
    expect(reconcileContentGenerationSelection(providers, routes, { type: "route", routeId: "missing" }))
      .toEqual({ type: "provider", providerId: "runninghub" });
  });

  it("groups routes by product without changing catalog order", () => {
    expect(groupGenerationRoutesByProduct(routes).map((group) => [group.product, group.routes.map((route) => route.id)]))
      .toEqual([["Wan", ["route-a", "route-c"]], ["Flux", ["route-b"]]]);
  });
});
