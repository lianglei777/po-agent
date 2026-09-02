#!/usr/bin/env node
// 重置范围被固定为测试数据目录中的单一认证文件，避免误删真实 Pi 数据。
import { createConnection } from "node:net";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOGIN_TEST_PORT, loginTestDataDirectory } from "./login-test.mjs";

export function accessControlConfigPath(root) {
  return path.join(loginTestDataDirectory(root), "access-control.json");
}

export function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (listening) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(listening);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

export async function resetLoginTest(root, options = {}) {
  const portIsListening = options.portIsListening ?? isPortListening;
  if (await portIsListening(LOGIN_TEST_PORT)) {
    throw new Error(
      `端口 ${LOGIN_TEST_PORT} 正在使用。请先停止 npm run login:test，再重置登录测试数据。`,
    );
  }
  const configPath = accessControlConfigPath(root);
  await rm(configPath, { force: true });
  return configPath;
}

async function main() {
  const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
  const configPath = await resetLoginTest(root);
  console.log(`已重置登录测试配置：${configPath}`);
  console.log("下次 npm run login:test 启动后，初始密码将恢复为 admin。");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`重置失败：${error.message}`);
    process.exitCode = 1;
  });
}
