import { QianwenAdapter } from "./qianwen-adapter";
import { createQianwenRoutes } from "./qianwen-catalog";
import {
  QIANWEN_CREDENTIAL_REF,
  QIANWEN_PROVIDER_ID,
} from "./qianwen-provider-constants";

export const qianwenProviderModule = {
  providerId: QIANWEN_PROVIDER_ID,
  displayName: "千问AI平台",
  credential: {
    reference: QIANWEN_CREDENTIAL_REF,
    kind: "api-key" as const,
    environmentVariable: "DASHSCOPE_API_KEY",
  },
  createProvider: () => new QianwenAdapter(),
  createRoutes: createQianwenRoutes,
};
