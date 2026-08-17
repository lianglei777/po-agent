import { describe, expect, it } from "vitest";
import { errorResponse } from "./api-response";

describe("errorResponse", () => {
  it("preserves AppError semantics across duplicated module instances", async () => {
    const error = Object.assign(new Error("The Agent is already processing a turn"), {
      name: "AppError",
      code: "AGENT_BUSY",
      status: 409,
    });

    const response = errorResponse(error);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "AGENT_BUSY",
        message: "The Agent is already processing a turn",
      },
    });
  });

  it("does not trust arbitrary AppError-shaped values with invalid status", async () => {
    const response = errorResponse(Object.assign(new Error("bad"), {
      name: "AppError",
      code: "AGENT_BUSY",
      status: 200,
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
