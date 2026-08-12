import type {
  UpdateWebAccessSettingsRequest,
  WebAccessSettingsResponse,
} from "@/contracts/web-access";
import type { AgentRuntimeRegistry } from "@/server/ports/agent-runtime";
import type { WebAccessSettingsStore } from "@/server/ports/web-access-settings";

export class WebAccessSettingsService {
  constructor(
    private readonly settings: WebAccessSettingsStore,
    private readonly runtimes: AgentRuntimeRegistry,
  ) {}

  read(): Promise<WebAccessSettingsResponse> {
    return this.settings.read();
  }

  async update(
    input: UpdateWebAccessSettingsRequest,
  ): Promise<WebAccessSettingsResponse> {
    await this.settings.write(input);
    // Extension 会缓存路由解析；标记存活 Session，在下一次提示前安全 reload。
    this.runtimes.invalidateWebAccessConfig();
    return this.settings.read();
  }
}
