#!/usr/bin/env node
// GitHub Actions 发布脚本：同步版本引用 -> 提交当前工作区 -> 创建 vX.Y.Z Tag -> 推送分支和 Tag。
// 镜像与桌面安装包完全由 Tag 触发的 GitHub Actions 构建，避免本机重复构建 Docker 镜像。

// npm run release -- patch
// npm run release -- minor
// npm run release -- major
// npm run release -- 1.2.3

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { nextVersion, updateVersionFiles } from "./docker-release.mjs";

const SEMVER = /^\d+\.\d+\.\d+$/;

export function tagForVersion(version) {
  if (!SEMVER.test(version)) {
    throw new Error(`无效版本号：${version}（必须是 x.y.z）`);
  }
  return `v${version}`;
}

export function createGitReleaseCommands(branch, version) {
  if (!branch) throw new Error("发布必须从一个本地分支执行，不能处于 detached HEAD 状态");
  const tag = tagForVersion(version);
  return [
    ["git", ["add", "--all"]],
    ["git", ["commit", "-m", `chore(release): ${tag}`]],
    ["git", ["tag", "-a", tag, "-m", `Release ${tag}`]],
    ["git", ["push", "origin", `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`]],
  ];
}

function run(root, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? undefined : "inherit",
  });
  if (result.error) {
    throw new Error(`无法执行 ${command} ${args.join(" ")}：${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = options.capture
      ? `：${(result.stderr || result.stdout || "").trim()}`
      : "";
    throw new Error(`命令执行失败（退出码 ${result.status}）：${command} ${args.join(" ")}${output}`);
  }
  return result.stdout?.trim() ?? "";
}

function currentBranch(root) {
  return run(root, "git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    capture: true,
  });
}

function ensureTagDoesNotExist(root, tag) {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], {
    cwd: root,
  });
  if (result.error) throw new Error(`无法检查本地 Tag：${result.error.message}`);
  if (result.status === 0) throw new Error(`本地 Tag ${tag} 已存在，不能重复发布`);
  if (result.status !== 1) throw new Error(`无法检查本地 Tag ${tag}`);
}

function printUsage() {
  console.log(`用法：npm run release -- <patch | minor | major | x.y.z>
示例：
  npm run release -- patch
  npm run release -- minor

脚本会提交当前工作区的全部未提交改动，并推送当前分支与 vX.Y.Z Tag。`);
}

function main() {
  const [bump] = process.argv.slice(2);
  if (!bump || bump.startsWith("-")) {
    printUsage();
    process.exit(1);
  }

  const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
  const packagePath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (!SEMVER.test(pkg.version)) {
    throw new Error(`package.json 的 version 不是 x.y.z 格式：${pkg.version}`);
  }
  const branch = currentBranch(root);
  const version = nextVersion(pkg.version, bump);
  if (version === pkg.version) {
    throw new Error(`目标版本与当前版本相同（${version}），无需发布`);
  }
  const tag = tagForVersion(version);
  ensureTagDoesNotExist(root, tag);

  console.log(`版本升级：${pkg.version} -> ${version}`);
  const planned = updateVersionFiles(root, pkg.version, version);
  for (const file of planned) {
    console.log(`  已更新 ${path.relative(root, file.filePath)}（${file.count} 处）`);
  }

  // 发布提交必须包含用户刚完成的功能改动和版本引用，避免 Tag 指向只有版本号的半成品。
  console.log("暂存当前工作区全部改动并创建发布提交。");
  for (const [command, args] of createGitReleaseCommands(branch, version)) {
    console.log(`执行：${command} ${args.join(" ")}`);
    run(root, command, args);
  }
  console.log(`完成：已推送 ${branch} 和 ${tag}。GitHub Actions 将根据 ${tag} 构建并发布镜像。`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`发布失败：${error.message}`);
    process.exit(1);
  }
}
