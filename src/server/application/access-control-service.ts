import { createHash, randomBytes } from "node:crypto";
import type {
  AccessControlSessionResponse,
  AccessControlSettingsResponse,
} from "@/contracts/access-control";
import { AppError } from "@/server/domain/app-error";
import type { AccessControlConfig } from "@/server/domain/access-control";
import type {
  AccessControlPasswordHasher,
  AccessControlStore,
} from "@/server/ports/access-control";

const DEFAULT_PASSWORD = "admin";
const MINIMUM_PASSWORD_LENGTH = 8;
const MAXIMUM_PASSWORD_LENGTH = 128;
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
const FAILURE_WINDOW_MS = 60 * 1000;
const MAX_FAILURES = 5;
const BLOCK_DURATION_MS = 60 * 1000;

type SessionRecord = { expiresAt: number };
type FailureRecord = { count: number; windowStartedAt: number; blockedUntil: number };

export class AccessControlService {
  private configPromise: Promise<AccessControlConfig> | null = null;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly failures = new Map<string, FailureRecord>();

  constructor(
    private readonly store: AccessControlStore,
    private readonly passwordHasher: AccessControlPasswordHasher,
    private readonly options: {
      developmentBypass: boolean;
      now?: () => number;
    },
  ) {}

  async getSession(token?: string): Promise<AccessControlSessionResponse> {
    if (this.options.developmentBypass) {
      return { state: "development-bypass" };
    }
    const config = await this.getConfig();
    if (!config.enabled) return { state: "disabled" };
    if (!this.hasValidSession(token)) return { state: "login-required" };
    return {
      state: config.mustChangePassword
        ? "password-change-required"
        : "authenticated",
    };
  }

  async getSettings(): Promise<AccessControlSettingsResponse> {
    const config = await this.getConfig();
    return {
      enabled: config.enabled,
      developmentBypass: this.options.developmentBypass,
    };
  }

  async assertAuthorized(token?: string): Promise<void> {
    const session = await this.getSession(token);
    if (
      session.state === "development-bypass" ||
      session.state === "disabled" ||
      session.state === "authenticated"
    ) {
      return;
    }
    if (session.state === "password-change-required") {
      throw new AppError(
        "PASSWORD_CHANGE_REQUIRED",
        "The default password must be changed before continuing",
        403,
      );
    }
    throw new AppError("AUTH_REQUIRED", "Authentication is required", 401);
  }

  async login(password: string, clientKey: string): Promise<{
    token: string;
    session: AccessControlSessionResponse;
  }> {
    if (this.options.developmentBypass) {
      return { token: "", session: { state: "development-bypass" } };
    }
    const config = await this.getConfig();
    if (!config.enabled) {
      return { token: "", session: { state: "disabled" } };
    }
    this.assertLoginAllowed(clientKey);
    if (!await this.passwordHasher.verify(password, config.password)) {
      this.recordLoginFailure(clientKey);
      throw new AppError("INVALID_PASSWORD", "The password is incorrect", 401);
    }
    this.failures.delete(clientKey);
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(tokenDigest(token), {
      expiresAt: this.now() + SESSION_LIFETIME_MS,
    });
    return {
      token,
      session: {
        state: config.mustChangePassword
          ? "password-change-required"
          : "authenticated",
      },
    };
  }

  logout(token?: string): void {
    if (token) this.sessions.delete(tokenDigest(token));
  }

  async changePassword(input: {
    token?: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    if (this.options.developmentBypass) {
      throw new AppError(
        "ACCESS_CONTROL_DEVELOPMENT_BYPASS",
        "Password changes are unavailable while development login bypass is active",
        409,
      );
    }
    const config = await this.getConfig();
    if (config.enabled && !this.hasValidSession(input.token)) {
      throw new AppError("AUTH_REQUIRED", "Authentication is required", 401);
    }
    if (!await this.passwordHasher.verify(input.currentPassword, config.password)) {
      throw new AppError("INVALID_PASSWORD", "The current password is incorrect", 401);
    }
    validateNewPassword(input.newPassword);
    const next = {
      ...config,
      mustChangePassword: false,
      password: await this.passwordHasher.hash(input.newPassword),
    } satisfies AccessControlConfig;
    await this.saveConfig(next);
    this.sessions.clear();
  }

  async updateEnabled(input: {
    token?: string;
    enabled: boolean;
    currentPassword: string;
  }): Promise<AccessControlSettingsResponse> {
    if (this.options.developmentBypass) {
      throw new AppError(
        "ACCESS_CONTROL_DEVELOPMENT_BYPASS",
        "Login verification settings are unavailable while development bypass is active",
        409,
      );
    }
    const config = await this.getConfig();
    if (config.enabled) await this.assertAuthorized(input.token);
    if (!await this.passwordHasher.verify(input.currentPassword, config.password)) {
      throw new AppError("INVALID_PASSWORD", "The current password is incorrect", 401);
    }
    if (config.enabled !== input.enabled) {
      await this.saveConfig({ ...config, enabled: input.enabled });
      this.sessions.clear();
    }
    return { enabled: input.enabled, developmentBypass: false };
  }

  private async getConfig(): Promise<AccessControlConfig> {
    if (!this.configPromise) this.configPromise = this.loadOrCreateConfig();
    return this.configPromise;
  }

  private async loadOrCreateConfig(): Promise<AccessControlConfig> {
    const existing = await this.store.read();
    if (existing) return existing;
    const config: AccessControlConfig = {
      version: 1,
      enabled: true,
      mustChangePassword: true,
      password: await this.passwordHasher.hash(DEFAULT_PASSWORD),
    };
    await this.store.write(config);
    return config;
  }

  private async saveConfig(config: AccessControlConfig): Promise<void> {
    await this.store.write(config);
    this.configPromise = Promise.resolve(config);
  }

  private hasValidSession(token?: string): boolean {
    if (!token) return false;
    const digest = tokenDigest(token);
    const session = this.sessions.get(digest);
    if (!session) return false;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(digest);
      return false;
    }
    return true;
  }

  private assertLoginAllowed(clientKey: string): void {
    const failure = this.failures.get(clientKey);
    if (!failure || failure.blockedUntil <= this.now()) return;
    throw new AppError(
      "AUTH_RATE_LIMITED",
      "Too many failed login attempts. Try again in one minute",
      429,
      { retryAfterSeconds: Math.ceil((failure.blockedUntil - this.now()) / 1000) },
    );
  }

  private recordLoginFailure(clientKey: string): void {
    const now = this.now();
    const previous = this.failures.get(clientKey);
    const active = previous && now - previous.windowStartedAt < FAILURE_WINDOW_MS;
    const count = active ? previous.count + 1 : 1;
    this.failures.set(clientKey, {
      count,
      windowStartedAt: active ? previous.windowStartedAt : now,
      blockedUntil: count >= MAX_FAILURES ? now + BLOCK_DURATION_MS : 0,
    });
    if (this.failures.size > 1_000) {
      const oldest = this.failures.keys().next().value as string | undefined;
      if (oldest) this.failures.delete(oldest);
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function validateNewPassword(password: string): void {
  if (password.length < MINIMUM_PASSWORD_LENGTH || password.length > MAXIMUM_PASSWORD_LENGTH) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Password must be between ${MINIMUM_PASSWORD_LENGTH} and ${MAXIMUM_PASSWORD_LENGTH} characters`,
      400,
    );
  }
  if (password === DEFAULT_PASSWORD) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The default password cannot be reused",
      400,
    );
  }
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
