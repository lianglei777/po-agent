import { RunningHubAdapter } from "./runninghub-adapter";
import { createRunningHubRoutes } from "./runninghub-catalog";
import { RUNNINGHUB_PROVIDER_ID } from "./runninghub-provider-constants";

export const runningHubProviderModule = {
  providerId: RUNNINGHUB_PROVIDER_ID,
  createProvider: () => new RunningHubAdapter(),
  createRoutes: createRunningHubRoutes,
};
