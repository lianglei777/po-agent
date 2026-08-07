import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectInstructions, getSystemInstructions } from "./api";
import { InstructionApiError } from "./types";

afterEach(() => vi.unstubAllGlobals());

describe("instructions api", () => {
  it("preserves the shared API error code and message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            success: false,
            error: {
              code: "INSTRUCTION_CONFLICT",
              message: "Instruction file changed",
            },
          },
          { status: 409 },
        ),
      ),
    );

    const error = await getSystemInstructions().catch((cause) => cause);

    expect(error).toBeInstanceOf(InstructionApiError);
    expect(error).toMatchObject({
      code: "INSTRUCTION_CONFLICT",
      message: "Instruction file changed",
      status: 409,
    });
  });

  it("forwards cancellation to project instruction requests", async () => {
    const request = vi.fn(async () =>
      Response.json({
        success: true,
        project: {
          content: "",
          exists: false,
          filePath: "D:/code/project/AGENTS.md",
          revision: "absent",
        },
      }),
    );
    vi.stubGlobal("fetch", request);
    const controller = new AbortController();

    await getProjectInstructions("D:/code/project", controller.signal);

    expect(request).toHaveBeenCalledWith(
      "/api/instructions/project?cwd=D%3A%2Fcode%2Fproject",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
