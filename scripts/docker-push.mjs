#!/usr/bin/env node
// 推送本地已构建的 po-agent 镜像到 Docker Hub（需先 docker login）。
// 按 package.json 当前版本打 <user>/po-agent:<版本> 与 :latest 两个标签并推送；
// 不改版本号、不重新构建——发版（升版本+构建+推送）用 docker:release。
// 用法：npm run docker:push -- --user <DockerHub用户名>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runCommand } from "./docker-release.mjs";

const SEMVER = /^\d+\.\d+\.\d+$/;

function main() {
  const rest = process.argv.slice(2);
  const userIndex = rest.indexOf("--user");
  const user = userIndex >= 0 ? rest[userIndex + 1] : undefined;
  if (!user || user.startsWith("--")) {
    throw new Error(
      "用法：npm run docker:push -- --user <DockerHub用户名>（需先 docker login）",
    );
  }

  const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!SEMVER.test(pkg.version)) {
    throw new Error(`package.json 的 version 不是 x.y.z 格式：${pkg.version}`);
  }
  const localTag = `po-agent:${pkg.version}`;

  // 推送前确认本地镜像存在；Docker 未运行时这里也会一并失败，提示统一给出
  const inspect = spawnSync("docker", ["image", "inspect", localTag]);
  if (inspect.status !== 0) {
    throw new Error(
      `本地没有镜像 ${localTag}（或 Docker 未运行）。先构建：docker compose build，或发版：npm run docker:release -- patch`,
    );
  }

  const remoteTags = [`${user}/po-agent:${pkg.version}`, `${user}/po-agent:latest`];
  for (const tag of remoteTags) {
    console.log(`打标签：${localTag} -> ${tag}`);
    runCommand(root, "docker", ["tag", localTag, tag]);
  }
  for (const tag of remoteTags) {
    console.log(`推送：docker push ${tag}`);
    runCommand(root, "docker", ["push", tag]);
  }
  console.log("完成。");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`推送失败：${error.message}`);
    process.exit(1);
  }
}
