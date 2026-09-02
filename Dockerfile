# npm 源，国内构建加速；切回官方：--build-arg NPM_REGISTRY=https://registry.npmjs.org
ARG NPM_REGISTRY=https://registry.npmmirror.com

# ===== deps：安装依赖（利用层缓存） =====
FROM node:22-bookworm-slim AS deps
ARG NPM_REGISTRY
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm config set registry "${NPM_REGISTRY}" \
 && npm ci --no-audit --no-fund

# ===== production-deps：保留完整生产依赖 =====
FROM deps AS production-deps
# Pi 扩展和 SDK 会在运行时动态加载；Next standalone 无法完整追踪其 npm 提升依赖，
# 因此 runner 必须使用 npm 解析出的完整生产依赖闭包，而不是只依赖 trace 结果。
RUN npm prune --omit=dev --no-audit --no-fund

# ===== builder：生产构建 =====
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ===== runner：最小运行镜像 =====
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# standalone server.js 需监听 0.0.0.0 才能从宿主机访问
ENV HOSTNAME=0.0.0.0
ENV PORT=51732
# 凭证 / 模型配置 / 项目列表 / 会话历史都写这里，挂卷持久化
ENV PI_CODING_AGENT_DIR=/data/pi-agent

# standalone 产物：自带 server.js 与 trace 出来的 node_modules
COPY --from=builder /app/.next/standalone ./
# 补齐动态 Pi 扩展及 SDK 的完整生产依赖，避免 linkedom 等提升依赖在运行镜像中丢失。
COPY --from=production-deps /app/node_modules ./node_modules
# 客户端静态资源（JS chunk / CSS 等）
COPY --from=builder /app/.next/static ./.next/static
# public 静态资源（侧边栏图标等）：standalone 产物不包含 public（桌面端由 prepare-standalone 补拷，
# Docker 无此步骤），漏拷会导致 /po-agent-icon.png 404
COPY --from=builder /app/public ./public

EXPOSE 51732
CMD ["node", "server.js"]
