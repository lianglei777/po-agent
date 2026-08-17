import type {
  AgentCommand,
  AgentCommandResult,
  AgentRuntimeResponse,
  AgentTurnRequest,
  AgentTurnResponse,
  AgentTurnSnapshotResponse,
  CreateAgentRequest,
  CreateAgentResponse,
} from "@/contracts/agent";
import type { ApiErrorResponse } from "@/contracts/common";
import type { ModelsResponse } from "@/contracts/models";
import type {
  SessionDetail,
} from "./agent-types";

/** 携带后端错误码的请求异常，便于前端按 code 分支处理 */
export class ApiRequestError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    const failure = data as ApiErrorResponse;
    throw new ApiRequestError(
      failure.error?.message ?? `Request failed (${response.status})`,
      failure.error?.code,
    );
  }
  return data as T;
}

export function loadSession(id: string) {
  return requestJson<SessionDetail>(
    `/api/sessions/${encodeURIComponent(id)}?includeState=true`,
  );
}

export function loadSessionContext(id: string, leafId: string) {
  const query = new URLSearchParams({ leafId });
  return requestJson<{ context: SessionDetail["context"] }>(
    `/api/sessions/${encodeURIComponent(id)}/context?${query}`,
  );
}

export function loadModels() {
  return requestJson<ModelsResponse>("/api/models");
}

export function createAgent(input: CreateAgentRequest) {
  return requestJson<CreateAgentResponse>("/api/agent/new", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function sendCommand<C extends AgentCommand>(
  id: string,
  command: C,
) {
  return requestJson<AgentCommandResult<C>>(
    `/api/agent/${encodeURIComponent(id)}`,
    {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
    },
  );
}

export function submitAgentTurn(id: string, input: AgentTurnRequest) {
  return requestJson<AgentTurnResponse>(
    `/api/agent/${encodeURIComponent(id)}/turns`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function loadAgentTurnSnapshot(id: string) {
  return requestJson<AgentTurnSnapshotResponse>(
    `/api/agent/${encodeURIComponent(id)}/turns`,
  );
}

export function loadRuntime(id: string) {
  return requestJson<AgentRuntimeResponse>(
    `/api/agent/${encodeURIComponent(id)}`,
  );
}
