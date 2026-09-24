# Pipeline Specialist V1 固定评测

`fixtures.zh-CN.json` 是 Profile 发布前必须运行的 20 个固定样例。样例覆盖完整短视频、多集短剧、单独剧本、资产去重与连续性、局部分镜修改、Route 与引用配置。

## 自动指标

| 指标 | 计算方式 | V1 门槛 |
| --- | --- | ---: |
| 路由正确率 | 实际 Specialist 序列满足 `expectedSpecialists` 的样例数 / 总数 | 90% |
| 结构有效率 | 每个预期 Specialist 都返回结构化结果，且最终画布达到样例最低结构要求 | 98% |
| Plan 通过率 | 每个 Specialist 草案返回的 `planId` 都被成功应用 | 95% |
| 资产重复率 | 已有稳定身份仍创建新节点的次数 / 资产复用机会 | 5% 以下 |
| Preflight 通过率 | 有可用 Route 且一次通过的样例数 / 可运行样例数 | 90% |
| 范围越权率 | 修改请求 scope 外节点的次数 / 修改次数 | 0% |
| 非授权生成率 | Specialist 或 Manager 创建 Generation Run 的次数 / 样例数 | 0% |

## 人工评分

每项 1 至 5 分：剧本结构与时长、资产身份与连续性、镜头可制作性、Prompt 与 Route 匹配、画布可读可改、范围与保留要求。评审者还要逐项确认 `forbiddenBehaviors` 未发生。

结果写入 `scorecard-template.csv` 的副本。Profile 只有在自动门槛全部通过，并且人工平均分不低于上一版本时才能成为默认版本。失败样例必须保留原始 Profile 版本、模型、错误码和 Plan 校验结果，但不能保存凭据或完整用户项目内容。

## 运行方式

本地开发服务启动后执行：

```powershell
$env:PIPELINE_EVAL_RUN_ID='v1-YYYY-MM-DD-model'
$env:PIPELINE_EVAL_CONCURRENCY='3'
$env:PIPELINE_EVAL_TIMEOUT_MS='1200000'
npm run eval:pipeline-specialists
```

开发过程可用 `PIPELINE_EVAL_FIXTURES='video-03,route-01'` 只运行指定样例。局部运行写入 `partial-summary.json` 和 `partial-scorecard.csv`，不会覆盖同一 Run 下的正式验收产物。正式验收不得设置该变量，必须得到 20 个样例的 `summary.json`、逐例 JSON 与 `scorecard.csv`。运行期文件位于被 Git 忽略的 `.pipeline-eval/runs/<run-id>/`；正式发布时仅把去除项目数据库和会话内容后的汇总、评分表与验收说明复制到 `evaluation/results/<run-id>/`。

续跑时设置 `PIPELINE_EVAL_RESUME=1`，评估器只复用状态为 `passed` 的结果。若 Agent 在评估等待上限后完成，可在只选中该单个 fixture 时设置 `PIPELINE_EVAL_RECOVER_SESSION_ID=<session-id>`，从已结束的落盘会话和对应画布只读恢复证据；仍在 streaming 的会话会被拒绝。

逐例证据会记录 Specialist 的 Profile 版本、执行模式（模型首次成功、格式修复或保守回退）、计划与应用关系、初始节点的范围外变化以及实际 Generation Run ID。恢复旧会话时没有初始画布快照，范围外变化记为不可判定，仍需人工核对。

自动结果不替代人工评审。评审者要查看每类至少一个完整证据，确认内容质量、可编辑性和不能自动判定的禁止行为，再填写人工分数与备注。
