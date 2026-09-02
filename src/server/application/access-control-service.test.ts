import { describe, expect, it } from "vitest";
import type { AccessControlConfig, AccessControlPasswordRecord } from "@/server/domain/access-control";
import type {
  AccessControlPasswordHasher,
  AccessControlStore,
} from "@/server/ports/access-control";
import { AccessControlService } from "./access-control-service";

class MemoryStore implements AccessControlStore {
  config: AccessControlConfig | null = null;

  async read() {
    return this.config;
  }

  async write(config: AccessControlConfig) {
    this.config = structuredClone(config);
  }
}

const hasher: AccessControlPasswordHasher = {
  async hash(password) {
    return record(password);
  },
  async verify(password, value) {
    return value.hash === Buffer.from(password).toString("base64");
  },
};

describe("AccessControlService", () => {
  it("forces the default password to be changed before authorizing APIs", async () => {
    const store = new MemoryStore();
    const service = createService(store);

    await expect(service.getSession()).resolves.toEqual({ state: "login-required" });
    expect(store.config).toMatchObject({ enabled: true, mustChangePassword: true });

    const login = await service.login("admin", "client");
    expect(login.session.state).toBe("password-change-required");
    await expect(service.assertAuthorized(login.token)).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_REQUIRED",
      status: 403,
    });

    await service.changePassword({
      token: login.token,
      currentPassword: "admin",
      newPassword: "new-password",
    });
    await expect(service.getSession(login.token)).resolves.toEqual({ state: "login-required" });
    await expect(service.login("admin", "client")).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
    });

    const nextLogin = await service.login("new-password", "client");
    await expect(service.getSession(nextLogin.token)).resolves.toEqual({ state: "authenticated" });
    await expect(service.assertAuthorized(nextLogin.token)).resolves.toBeUndefined();
  });

  it("persists the verification switch and invalidates sessions", async () => {
    const store = new MemoryStore();
    store.config = config({ mustChangePassword: false });
    const service = createService(store);
    const login = await service.login("secret-password", "client");

    await expect(service.updateEnabled({
      token: login.token,
      enabled: false,
      currentPassword: "secret-password",
    })).resolves.toEqual({ enabled: false, developmentBypass: false });
    await expect(service.getSession()).resolves.toEqual({ state: "disabled" });
    await expect(service.assertAuthorized()).resolves.toBeUndefined();

    await service.updateEnabled({
      enabled: true,
      currentPassword: "secret-password",
    });
    await expect(service.getSession()).resolves.toEqual({ state: "login-required" });
  });

  it("blocks a client for one minute after five failed logins", async () => {
    let now = 1_000;
    const store = new MemoryStore();
    store.config = config({ mustChangePassword: false });
    const service = createService(store, () => now);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.login("wrong", "client")).rejects.toMatchObject({
        code: "INVALID_PASSWORD",
      });
    }
    await expect(service.login("secret-password", "client")).rejects.toMatchObject({
      code: "AUTH_RATE_LIMITED",
      status: 429,
    });
    now += 60_000;
    await expect(service.login("secret-password", "client")).resolves.toMatchObject({
      session: { state: "authenticated" },
    });
  });

  it("bypasses login in development without changing persisted settings", async () => {
    const store = new MemoryStore();
    const service = new AccessControlService(store, hasher, {
      developmentBypass: true,
    });

    await expect(service.getSession()).resolves.toEqual({ state: "development-bypass" });
    await expect(service.assertAuthorized()).resolves.toBeUndefined();
    expect(store.config).toBeNull();
  });
});

function createService(store: MemoryStore, now?: () => number) {
  return new AccessControlService(store, hasher, {
    developmentBypass: false,
    now,
  });
}

function config(
  overrides: Partial<AccessControlConfig> = {},
): AccessControlConfig {
  return {
    version: 1,
    enabled: true,
    mustChangePassword: true,
    password: record("secret-password"),
    ...overrides,
  };
}

function record(password: string): AccessControlPasswordRecord {
  return {
    algorithm: "scrypt",
    salt: "test-salt",
    hash: Buffer.from(password).toString("base64"),
  };
}
