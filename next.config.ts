import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const allowedDevOrigins = process.env.PO_AGENT_ALLOWED_DEV_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // 开发环境如需局域网访问，由使用者显式配置，避免固化单台机器的 IP。
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  // 生成最小化生产产物到 .next/standalone，供 Docker 直接 `node server.js` 运行。
  output: "standalone",
  serverExternalPackages: [
    "@earendil-works/pi-ai",
    "@earendil-works/pi-coding-agent",
    "pi-web-access",
  ],
  // 这两个 SDK 运行时按 __dirname 读取自带主题/模板/提示词等资源，
  // 显式纳入 trace，避免 standalone 产物漏拷导致容器内运行时缺文件。
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/@earendil-works/pi-coding-agent/dist/**/*",
      "node_modules/@earendil-works/pi-ai/dist/**/*",
      // pi-web-access 由 Pi Extension loader 在运行时加载 TypeScript 入口，静态 import 无法覆盖完整文件集。
      "node_modules/pi-web-access/**/*",
    ],
  },
  outputFileTracingExcludes: {
    "/*": [".desktop-dist/**/*", "dist-desktop/**/*"],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
