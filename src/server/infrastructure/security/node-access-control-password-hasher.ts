import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { AccessControlPasswordRecord } from "@/server/domain/access-control";
import type { AccessControlPasswordHasher } from "@/server/ports/access-control";

const KEY_LENGTH = 64;

export class NodeAccessControlPasswordHasher
  implements AccessControlPasswordHasher
{
  async hash(password: string): Promise<AccessControlPasswordRecord> {
    const salt = randomBytes(16);
    const hash = await deriveKey(password, salt);
    return {
      algorithm: "scrypt",
      salt: salt.toString("base64"),
      hash: Buffer.from(hash).toString("base64"),
    };
  }

  async verify(
    password: string,
    record: AccessControlPasswordRecord,
  ): Promise<boolean> {
    const expected = Buffer.from(record.hash, "base64");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = Buffer.from(
      await deriveKey(password, Buffer.from(record.salt, "base64")),
    );
    return timingSafeEqual(actual, expected);
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
