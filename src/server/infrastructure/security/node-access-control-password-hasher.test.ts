import { describe, expect, it } from "vitest";
import { NodeAccessControlPasswordHasher } from "./node-access-control-password-hasher";

describe("NodeAccessControlPasswordHasher", () => {
  it("uses a random salt and verifies without storing plaintext", async () => {
    const hasher = new NodeAccessControlPasswordHasher();
    const first = await hasher.hash("example-password");
    const second = await hasher.hash("example-password");

    expect(first.algorithm).toBe("scrypt");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toContain("example-password");
    await expect(hasher.verify("example-password", first)).resolves.toBe(true);
    await expect(hasher.verify("wrong-password", first)).resolves.toBe(false);
  });
});
