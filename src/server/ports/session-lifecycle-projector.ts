export interface CreatedSessionProjection {
  sessionId: string;
  cwd: string;
  sessionFile: string;
  createdAt: string;
}

/**
 * 把新建 Agent Session 同步投影到依赖 Session 身份的其他持久化边界。
 * create 返回前完成投影，避免素材上传等紧随其后的请求只看到半创建状态。
 */
export interface SessionLifecycleProjector {
  registerCreatedSession(input: CreatedSessionProjection): Promise<void>;
}
