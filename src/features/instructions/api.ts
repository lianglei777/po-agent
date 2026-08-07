import type {
  SystemInstructionsResponse,
  ProjectInstructionsResponse,
  SaveSystemInstructionsRequest,
  DeleteSystemInstructionsRequest,
  SaveProjectInstructionsRequest,
  DeleteProjectInstructionsRequest,
} from "@/contracts/instructions";
import type { ApiErrorResponse } from "@/contracts/common";
import { InstructionApiError } from "./types";

/** 解析 API 错误响应。 */
async function parseError(response: Response): Promise<InstructionApiError> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    return new InstructionApiError(
      body.error?.message || response.statusText,
      body.error?.code,
      response.status,
    );
  } catch {
    return new InstructionApiError(response.statusText, undefined, response.status);
  }
}

/** 获取全局追加提示词。 */
export async function getSystemInstructions(): Promise<SystemInstructionsResponse> {
  const response = await fetch("/api/instructions/system", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw await parseError(response);
  return response.json();
}

/** 保存全局追加提示词。 */
export async function saveSystemInstructions(
  request: SaveSystemInstructionsRequest,
): Promise<SystemInstructionsResponse> {
  const response = await fetch("/api/instructions/system", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await parseError(response);
  return response.json();
}

/** 删除全局追加提示词。 */
export async function deleteSystemInstructions(
  request: DeleteSystemInstructionsRequest,
): Promise<void> {
  const response = await fetch("/api/instructions/system", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await parseError(response);
}

/** 获取项目指令。 */
export async function getProjectInstructions(
  cwd: string,
  signal?: AbortSignal,
): Promise<ProjectInstructionsResponse> {
  const response = await fetch(
    `/api/instructions/project?cwd=${encodeURIComponent(cwd)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal,
    },
  );
  if (!response.ok) throw await parseError(response);
  return response.json();
}

/** 保存项目指令。 */
export async function saveProjectInstructions(
  request: SaveProjectInstructionsRequest,
): Promise<ProjectInstructionsResponse> {
  const response = await fetch("/api/instructions/project", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await parseError(response);
  return response.json();
}

/** 删除项目指令。 */
export async function deleteProjectInstructions(
  request: DeleteProjectInstructionsRequest,
): Promise<void> {
  const response = await fetch("/api/instructions/project", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await parseError(response);
}

/** 向指定 Agent 发送 reload_instructions 命令。 */
export async function reloadInstructions(agentId: string): Promise<unknown> {
  const response = await fetch(`/api/agent/${encodeURIComponent(agentId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "reload_instructions" }),
  });
  if (!response.ok) throw await parseError(response);
  return response.json();
}
