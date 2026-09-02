#!/usr/bin/env node
// po-agent 镜像发布脚本：升版本号 -> 同步全部版本引用 -> 构建镜像 -> 可选推送 Docker Hub。
// 用法（项目根目录执行，或 npm run docker:release -- <参数>）：
//   node scripts/docker-release.mjs patch      # 0.2.0 -> 0.2.1
//   node scripts/docker-release.mjs minor      # 0.2.0 -> 0.3.0
//   node scripts/docker-release.mjs major      # 0.2.0 -> 1.0.0
//   node scripts/docker-release.mjs 1.2.3      # 显式指定版本
// 可选参数：
//   --user <DockerHub用户名>  额外打 <user>/po-agent:<版本> 与 :latest 两个仓库标签
//   --push                   推送 Docker Hub（需先 docker login，必须配合 --user）

// npm run docker:release -- patch --user lianglei777 --push

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SEMVER = /^\d+\.\d+\.\d+$/;

// 所有承载版本号的位置：package.json 的 version 字段，以及镜像标签 po-agent:<version>
// （docker-compose.dev.yml 的 <version>-dev 由前缀匹配一并覆盖）。
// 新增版本引用时必须同步加到这里；脚本校验每个文件都命中，防止漂移后静默漏改。
const VERSION_FILES = [
  "package.json",
  "docker-compose.yml",
  "docker-compose.dev.yml",
  "docs/operations/docker-deploy.md",
];

export function nextVersion(current, bump) {
  if (SEMVER.test(bump)) return bump;
  const [major, minor, patch] = current.split(".").map(Number);
  const table = {
    patch: `${major}.${minor}.${patch + 1}`,
    minor: `${major}.${minor + 1}.0`,
    major: `${major + 1}.0.0`,
  };
  const next = table[bump];
  if (!next) {
    throw new Error(`无效的版本参数：${bump}（可用 patch / minor / major 或 x.y.z）`);
  }
  return next;
}

export function applyVersionToContent(content, fromVersion, toVersion) {
  const replacements = [
    [`"version": "${fromVersion}"`, `"version": "${toVersion}"`],
    [`po-agent:${fromVersion}`, `po-agent:${toVersion}`],
  ];
  let next = content;
  let count = 0;
  for (const [from, to] of replacements) {
    const parts = next.split(from);
    count += parts.length - 1;
    next = parts.join(to);
  }
  return { content: next, count };
}

export function updateVersionFiles(root, fromVersion, toVersion) {
  // 先对全部文件完成替换计算并校验命中数，全部通过后才统一落盘，
  // 避免中途失败留下“部分文件已改、部分未改”的不一致状态。
  const planned = VERSION_FILES.map((file) => {
    const filePath = path.join(root, file);
    const original = fs.readFileSync(filePath, "utf8");
    const result = applyVersionToContent(original, fromVersion, toVersion);
    if (result.count === 0) {
      throw new Error(
        `${file} 中没有找到版本 ${fromVersion} 的引用，版本引用已漂移，请先人工核对`,
      );
    }
    return {
      filePath,
      original,
      content: result.content,
      count: result.count,
    };
  });
  for (const p of planned) {
    fs.writeFileSync(p.filePath, p.content, "utf8");
  }
  return planned;
}

export function restoreVersionFiles(planned) {
  for (const file of planned) {
    fs.writeFileSync(file.filePath, file.original, "utf8");
  }
}

export function createBuildArguments(version, remoteTags = []) {
  return [
    "build",
    "--platform",
    "linux/amd64",
    "-t",
    `po-agent:${version}`,
    ...remoteTags.flatMap((tag) => ["-t", tag]),
    ".",
  ];
}

export function runCommand(root, command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) {
    throw new Error(`无法执行 ${command}：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`命令执行失败（退出码 ${result.status}）：${command} ${args.join(" ")}`);
  }
}

function printUsage() {
  console.log(`用法：node scripts/docker-release.mjs <patch | minor | major | x.y.z> [--user <DockerHub用户名>] [--push]
示例：
  node scripts/docker-release.mjs patch
  node scripts/docker-release.mjs minor --user myname --push`);
}

function main() {
  const [bumpArg, ...rest] = process.argv.slice(2);
  if (!bumpArg || bumpArg.startsWith("--")) {
    printUsage();
    process.exit(1);
  }
  const userIndex = rest.indexOf("--user");
  const user = userIndex >= 0 ? rest[userIndex + 1] : undefined;
  const push = rest.includes("--push");
  if (push && !user) {
    throw new Error("--push 需要同时指定 --user <DockerHub用户名>");
  }

  const root = path.resolve(fileURLToPath(import.meta.url), "..", "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (!SEMVER.test(pkg.version)) {
    throw new Error(`package.json 的 version 不是 x.y.z 格式：${pkg.version}`);
  }
  const fromVersion = pkg.version;
  const toVersion = nextVersion(fromVersion, bumpArg);
  if (toVersion === fromVersion) {
    throw new Error(`目标版本与当前版本相同（${fromVersion}），无需发布`);
  }

  // 镜像按当前工作区内容构建，未提交改动会一并打进去：只提醒，不阻断。
  const gitStatus = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  if (gitStatus.status === 0 && gitStatus.stdout.trim()) {
    console.warn("提醒：工作区有未提交改动，它们会被构建进镜像。");
  }

  console.log(`版本升级：${fromVersion} -> ${toVersion}`);
  const planned = updateVersionFiles(root, fromVersion, toVersion);
  for (const p of planned) {
    console.log(`  已更新 ${path.relative(root, p.filePath)}（${p.count} 处）`);
  }

  const remoteTags = [];
  if (user) {
    remoteTags.push(`${user}/po-agent:${toVersion}`, `${user}/po-agent:latest`);
  }
  // 固定 linux/amd64：本机可能是 arm64，显式指定保证镜像能在常见云服务器上运行。
  // docker build 的最后一个参数必须是构建上下文目录，避免把版本文件改完后才因缺少上下文失败。
  const buildArgs = createBuildArguments(toVersion, remoteTags);
  console.log(`构建镜像：docker ${buildArgs.join(" ")}`);
  try {
    runCommand(root, "docker", buildArgs);
  } catch (error) {
    // 镜像尚未产出时恢复版本文件，允许用户修复环境后以同一个 patch 重新执行。
    restoreVersionFiles(planned);
    throw error;
  }

  if (push) {
    for (const tag of remoteTags) {
      console.log(`推送：docker push ${tag}`);
      runCommand(root, "docker", ["push", tag]);
    }
    console.log("完成。");
  } else if (user) {
    console.log(`完成。推送（需先 docker login）：
  docker push ${remoteTags[0]}
  docker push ${remoteTags[1]}`);
  } else {
    console.log(`完成。本地镜像：po-agent:${toVersion}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`发布失败：${error.message}`);
    process.exit(1);
  }
}
