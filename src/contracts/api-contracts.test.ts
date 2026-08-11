import { describe, expectTypeOf, it } from "vitest";
import type {
  AgentCommand,
  AgentCommandResult,
  AgentRuntimeState,
} from "./agent";
import type {
  AgentSettingsResponse,
  UpdateAgentSettingsRequest,
} from "./agent-settings";
import type { SuccessResponse } from "./common";
import type {
  FileEntry,
  FileWatchEvent,
  ListFilesResponse,
} from "./files";
import type { ApiKeyStatusResponse, OAuthServerEvent } from "./auth";
import type {
  ModelDiscoveryResponse,
  ModelsConfigBootstrapResponse,
  ModelsResponse,
  ModelTestResponse,
} from "./models";
import type { ListProjectsResponse, Project } from "./projects";
import type { ListSessionsResponse, SessionInfo } from "./sessions";
import type { HomeResponse } from "./system";
import type {
  InstallSkillRequest,
  RemoveSkillRequest,
  SearchSkillsRequest,
  SetSkillInvocationRequest,
} from "./skills";

describe("shared API contracts", () => {
  it("covers Agent command and state drift", () => {
    expectTypeOf<
      Extract<AgentCommand, { type: "set_auto_retry" }>
    >().toEqualTypeOf<{ type: "set_auto_retry"; enabled: boolean }>();
    expectTypeOf<AgentRuntimeState>().toHaveProperty("sessionFile");
    expectTypeOf<AgentRuntimeState>().toHaveProperty("autoRetryEnabled");
    expectTypeOf<AgentCommandResult<{ type: "get_state" }>>().toEqualTypeOf<AgentRuntimeState>();
    expectTypeOf<AgentCommandResult<{ type: "abort" }>>().toEqualTypeOf<SuccessResponse>();
    expectTypeOf<
      Extract<import("./agent").AgentEvent, { type: "error" }>
    >().toEqualTypeOf<{ type: "error"; message: string }>();
  });

  it("covers global Agent settings", () => {
    expectTypeOf<AgentSettingsResponse>().toEqualTypeOf<{
      autoCompactionEnabled: boolean;
    }>();
    expectTypeOf<UpdateAgentSettingsRequest>().toEqualTypeOf<{
      autoCompactionEnabled: boolean;
    }>();
  });

  it("covers workspace API responses", () => {
    expectTypeOf<HomeResponse>().toEqualTypeOf<{ home: string }>();
    expectTypeOf<ListProjectsResponse>().toEqualTypeOf<Project[]>();
    expectTypeOf<ListSessionsResponse>().toEqualTypeOf<SessionInfo[]>();
    expectTypeOf<ListFilesResponse>().toEqualTypeOf<FileEntry[]>();
    expectTypeOf<
      Extract<FileWatchEvent, { type: "error" }>
    >().toEqualTypeOf<{ type: "error"; message: string }>();
  });

  it("covers model and auth API responses", () => {
    expectTypeOf<ModelsResponse>().toHaveProperty("models");
    expectTypeOf<ModelsConfigBootstrapResponse>().toHaveProperty(
      "apiKeyProviders",
    );
    expectTypeOf<ModelDiscoveryResponse>().toHaveProperty("models");
    expectTypeOf<ModelTestResponse>().toHaveProperty("verification");
    expectTypeOf<ApiKeyStatusResponse>().toHaveProperty("configured");
    expectTypeOf<
      Extract<OAuthServerEvent, { type: "complete" }>
    >().toEqualTypeOf<{ type: "complete" }>();
  });

  it("covers skill request bodies", () => {
    expectTypeOf<InstallSkillRequest>().toHaveProperty("package");
    expectTypeOf<RemoveSkillRequest>().toHaveProperty("skillId");
    expectTypeOf<SearchSkillsRequest>().toHaveProperty("query");
    expectTypeOf<SetSkillInvocationRequest>().toHaveProperty("disabled");
  });
});
