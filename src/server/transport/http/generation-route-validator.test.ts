import { describe, expect, it } from "vitest";
import { updateGenerationRouteRequest } from "./generation-route-validator";

describe("updateGenerationRouteRequest", () => {
  it("accepts independent enable and default updates", () => {
    expect(updateGenerationRouteRequest({ enabled: false })).toEqual({
      enabled: false,
      isDefault: undefined,
    });
    expect(updateGenerationRouteRequest({ isDefault: true })).toEqual({
      enabled: undefined,
      isDefault: true,
    });
  });

  it("rejects disabling and making the same route default atomically", () => {
    expect(() => updateGenerationRouteRequest({ enabled: false, isDefault: true }))
      .toThrow("cannot be disabled and made default");
  });
});
