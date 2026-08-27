import { describe, expect, it } from "vitest";
import { generationParameterConflict } from "./generation-input-constraints";

describe("generationParameterConflict", () => {
  const constraints = [{
    kind: "mutually-exclusive-parameters" as const,
    keys: ["fileUrl", "linkUrl"],
  }];

  it("reports populated mutually exclusive parameters", () => {
    expect(generationParameterConflict(constraints, {
      fileUrl: "https://files.example/brief.pdf",
      linkUrl: "https://example.com/brief",
    })).toEqual({ keys: ["fileUrl", "linkUrl"] });
  });

  it("allows either parameter independently", () => {
    expect(generationParameterConflict(constraints, {
      fileUrl: "https://files.example/brief.pdf",
      linkUrl: "",
    })).toBeNull();
  });
});
