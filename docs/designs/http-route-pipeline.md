# HTTP Route Pipeline 设计

## 背景

Po Agent 使用 Next.js App Router Route Handler 暴露 JSON、SSE、文件、Range 和媒体接口。现有接口已经共享 `handleRoute` 错误映射，但访问控制是在后续新增的 `_access.ts` 中通过同名 helper 和少量手工 `apiAccessError()` 接入。该实现能够保护现有接口，却存在三个长期问题：

1. 有鉴权和无鉴权的 helper 同名，错误 import 可能意外公开接口。
2. SSE、文件和媒体响应需要手工鉴权，新增特殊接口时容易遗漏。
3. 成功响应、错误响应和原始 `Response` 没有统一经过最终响应策略，后续增加请求 ID、缓存或安全头时仍可能出现分支。

本设计建立一条覆盖入口和出口的 Route Pipeline，使以后增加公共 HTTP 行为时只修改管线，不再批量修改业务 Route Handler。

## 目标

- 所有业务接口默认受保护；公开接口必须显式使用 `publicRoute`。
- JSON、204、SSE、文件、Range 和媒体响应使用同一条执行管线。
- 统一处理访问控制、结果序列化、错误映射和最终响应策略。
- 保持现有成功响应合同，不增加 `{ success: true, data }` 包装。
- 未知异常不向客户端暴露内部错误消息。
- Route Handler 保持薄层，只负责解析 HTTP 输入、调用 application service 和选择状态码。
- 通过结构测试阻止未来接口绕过管线。

## 非目标

- 不引入多用户、角色或资源级权限模型。
- 不以 Next.js Proxy 代替服务端授权。Proxy 可以用于重定向或粗粒度策略，但不能成为唯一授权边界。
- 不统一 SSE 建立后的事件错误；流开始后 HTTP 状态码和响应头已经不可修改，仍由 SSE adapter 发送错误事件并清理资源。
- 不在本次改动中增加请求正文日志、分布式追踪或新的缓存能力。

## 架构位置

```text
src/app/api/**/route.ts
        |
        v
src/app/api/_route.ts                 Next.js / Cookie / composition 接线
        |
        v
src/server/transport/http/route-pipeline.ts
        |                 |
        |                 +--> error mapper
        +--------------------> response finalizer
        |
        v
application service
```

`src/app/api/_route.ts` 是 App Router 的统一适配入口，可以依赖 Next.js `cookies()` 和 production `container`。纯 HTTP 结果处理保留在 `src/server/transport/http`，不反向依赖 composition。

## 对外 API

### 受保护接口

```ts
return protectedRoute(() => container.sessionService.list());
```

管线在执行 callback 前验证当前 Cookie Session。未登录返回 `AUTH_REQUIRED`，首次登录未改密返回 `PASSWORD_CHANGE_REQUIRED`。

### 公开接口

```ts
return publicRoute(() => container.accessControlService.getSession(token));
```

只有 Access Control 的 session、login、logout、change-password 和 settings 接口允许使用 `publicRoute`。其中需要权限或当前密码的规则继续由 `AccessControlService` 校验，不能只依赖公开/受保护分类。

### 返回普通数据

Callback 返回非 `Response` 值时，管线使用 `Response.json()` 序列化：

```ts
return protectedRoute<ProjectResponse>(() => service.read());
```

### 返回显式 Response

需要非 200 状态、204、流或二进制内容时，Callback 返回原生 `Response`：

```ts
return protectedRoute(async () => {
  await service.delete();
  return new Response(null, { status: 204 });
});
```

SSE、Range 和媒体也遵循相同规则：

```ts
return protectedRoute(() => createSseResponse(options));
```

管线识别 `Response` 后不再进行 JSON 包装，只执行最终响应处理。

## 执行顺序

```text
1. 生成 requestId
2. protectedRoute 执行访问控制；publicRoute 跳过该步骤
3. 调用 Route callback
4. 普通值序列化为 JSON；Response 原样接收
5. 捕获异常并映射为统一错误响应
6. 执行 response finalizer
7. 返回 Response
```

访问控制必须发生在读取请求体、解析路径后访问数据或调用 application service 之前。Route callback 内抛出的验证错误也由同一错误出口处理。

## 统一错误出口

预期错误使用 `AppError`：

```json
{
  "success": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication is required"
  }
}
```

未知异常不进入客户端响应；服务端如需记录诊断信息，必须使用经过脱敏的日志策略。客户端固定返回：

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error"
  }
}
```

不得把未知 `Error.message`、文件路径、供应商响应、凭证或堆栈直接返回客户端。
未知异常必须写入服务端诊断日志，并与响应 `X-Request-Id` 关联；日志写入失败不能改变
客户端脱敏响应。

## Response Finalizer

所有成功和失败响应统一补充以下策略：

- `X-Request-Id`：每次请求生成稳定的服务端请求标识。
- `X-Content-Type-Options: nosniff`。
- `Vary: Cookie`：保留已有 `Vary` 值并追加，不覆盖其他缓存维度。
- 没有显式缓存策略时设置 `Cache-Control: private, no-store`。
- 错误响应始终使用 `Cache-Control: no-store`。
- `AUTH_RATE_LIMITED` 根据错误 details 添加 `Retry-After`。

Finalizer 必须保留业务响应的必要语义：

- SSE 的 `text/event-stream`、`no-cache, no-transform`、`X-Accel-Buffering: no`。
- Range 的 `206`、`Content-Range`、`Accept-Ranges` 和 `Content-Length`。
- 文件和媒体的 `Content-Type`、`Content-Disposition` 及显式缓存策略。
- `204` 不增加响应体。
- 登录流程的 `Set-Cookie` 不得丢失。

## 成功响应合同

现有成功响应继续直接返回业务数据：

```json
{ "sessionId": "019e..." }
```

不改成统一的 `{ success: true, data }`，因为这会破坏所有客户端合同，并且不适用于文件和 SSE。统一出口关注序列化过程、状态码、错误、缓存和安全策略，而不是强制所有协议载荷同形。

## 命名与约束

- 业务 Route Handler 只能从 `@/app/api/_route` 导入 `protectedRoute`、`publicRoute` 和 `readJson`。
- 禁止业务 Route Handler 直接导入 `api-response`。
- 禁止在管线外手工调用 `errorResponse`、`apiAccessError` 或 `assertApiAccess`。
- 普通业务接口不得使用 `publicRoute`。
- Access Control 公开接口不得通过 import 路径伪装成受保护接口。

## 测试策略

### 管线行为测试

- 普通数据被序列化为 JSON。
- 原生 `Response` 的状态、正文和特殊头被保留。
- 授权失败时 callback 不执行。
- `AppError` 保留公开 code、message 和状态码。
- 未知异常统一脱敏为 `INTERNAL_ERROR`。
- Finalizer 合并而不是覆盖 `Vary`。
- 显式 SSE、Range 和媒体缓存头不被默认策略覆盖。
- 限流错误包含 `Retry-After`。

### 结构测试

递归扫描 `src/app/api/**/route.ts`：

- 所有 Route 都必须导入 `@/app/api/_route`。
- 除 `access-control` 外不得使用 `publicRoute`。
- 不得导入旧 `_access` 或底层 `api-response`。
- 不得出现手工 `apiAccessError`。

## 迁移步骤

1. 新增 transport `route-pipeline.ts` 与统一 finalizer。
2. 新增 App Router adapter `_route.ts`，提供 `protectedRoute` 和 `publicRoute`。
3. 普通接口从旧 `_access.handleRoute` 迁移到 `protectedRoute`。
4. Access Control 接口迁移到 `publicRoute`。
5. 把 SSE、文件、媒体和 204 的完整工作放入 callback，移除手工鉴权和错误捕获。
6. 删除旧 `_access.ts`，禁止双入口并存。
7. 更新结构测试、API 文档与架构文档。

## 完成标准

- 所有 Route Handler 只通过 `_route.ts` 进入 HTTP 管线。
- 所有成功和失败响应都经过 finalizer。
- JSON、SSE、文件、Range、媒体和 204 行为保持兼容。
- `npm run check` 和 `npm run build` 通过。
- 不需要为下一项公共 HTTP 行为再次逐接口接线。
