import type {
  AgentSettingsResponse,
  UpdateAgentSettingsRequest,
} from "@/contracts/agent-settings";
import type { AgentRuntimeRegistry } from "@/server/ports/agent-runtime";
import type { AgentSettingsStore } from "@/server/ports/agent-settings";

export class AgentSettingsService {
  constructor(
    private readonly settings: AgentSettingsStore,
    private readonly runtimes: AgentRuntimeRegistry,
  ) {}

  read(): Promise<AgentSettingsResponse> {
    return this.settings.read();
  }

  async update(
    input: UpdateAgentSettingsRequest,
  ): Promise<AgentSettingsResponse> {
    await this.settings.setAutoCompactionEnabled(
      input.autoCompactionEnabled,
    );
    // 全局设置写入后刷新存活 runtime，避免它们继续使用各自的旧设置快照。
    await this.runtimes.reloadAgentSettings();
    return this.settings.read();
  }
}
