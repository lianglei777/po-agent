export interface AccessControlPasswordRecord {
  algorithm: "scrypt";
  salt: string;
  hash: string;
}

export interface AccessControlConfig {
  version: 1;
  enabled: boolean;
  mustChangePassword: boolean;
  password: AccessControlPasswordRecord;
}
