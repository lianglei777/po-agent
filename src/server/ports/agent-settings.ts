export interface AgentSettingsSnapshot {
  autoCompactionEnabled: boolean;
}

export interface AgentSettingsStore {
  read(): Promise<AgentSettingsSnapshot>;
  setAutoCompactionEnabled(enabled: boolean): Promise<void>;
}
