import type {
  AccessControlConfig,
  AccessControlPasswordRecord,
} from "@/server/domain/access-control";

export interface AccessControlStore {
  read(): Promise<AccessControlConfig | null>;
  write(config: AccessControlConfig): Promise<void>;
}

export interface AccessControlPasswordHasher {
  hash(password: string): Promise<AccessControlPasswordRecord>;
  verify(
    password: string,
    record: AccessControlPasswordRecord,
  ): Promise<boolean>;
}
