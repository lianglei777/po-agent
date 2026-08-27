import { RunningHubAdapter } from "./runninghub-adapter";
import { createRunningHubRoutes } from "./runninghub-catalog";
import { RUNNINGHUB_PROVIDER_ID } from "./runninghub-provider-constants";
import { RUNNINGHUB_CREDENTIAL_REF } from "./runninghub-provider-constants";

export const runningHubProviderModule = {
  providerId: RUNNINGHUB_PROVIDER_ID,
  displayName: "RunningHub",
  credential: {
    reference: RUNNINGHUB_CREDENTIAL_REF,
    kind: "api-key" as const,
    environmentVariable: "RUNNINGHUB_API_KEY",
  },
  createProvider: () => new RunningHubAdapter(),
  createRoutes: createRunningHubRoutes,
};
