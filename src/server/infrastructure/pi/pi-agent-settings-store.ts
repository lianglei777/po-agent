import {
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AgentSettingsSnapshot,
  AgentSettingsStore,
} from "@/server/ports/agent-settings";

type SettingsManagerAdapter = {
  flush(): Promise<void>;
  getGlobalSettings(): { compaction?: { enabled?: boolean } };
  setCompactionEnabled(enabled: boolean): void;
};

export class PiAgentSettingsStore implements AgentSettingsStore {
  constructor(
    private readonly settingsManager: SettingsManagerAdapter =
      SettingsManager.create(process.cwd(), getAgentDir()),
  ) {}

  async read(): Promise<AgentSettingsSnapshot> {
    return {
      autoCompactionEnabled:
        this.settingsManager.getGlobalSettings().compaction?.enabled ?? true,
    };
  }

  async setAutoCompactionEnabled(enabled: boolean): Promise<void> {
    this.settingsManager.setCompactionEnabled(enabled);
    await this.settingsManager.flush();
  }
}
