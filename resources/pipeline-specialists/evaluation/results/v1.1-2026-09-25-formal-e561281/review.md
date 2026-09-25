# Pipeline Specialist V1.1 正式验收记录

日期：2026-09-25  
代码：`e561281`（`feature/pipeline-specialists`）  
模型：`new-api:qwen3.8-max`  
Profile：Script 1.1.0、Asset 1.1.0、Storyboard 1.2.0、Prompt 1.6.0

## 结论

固定 20 条样例全部执行并留下逐例结果，但自动门槛**未通过**，V1.1 不得作为已验收版本发布。V1 已有验收结论不受本次实验影响。本次不填写未经人工内容审阅的主观分数。

| 指标 | 本次 | 门槛 | 判定 |
| --- | ---: | ---: | --- |
| 路由正确率 | 95% | ≥90% | 通过 |
| 结构有效率 | 80% | ≥98% | 失败 |
| Plan 通过率 | 80% | ≥95% | 失败 |
| 资产重复率 | 0% | ≤5% | 通过 |
| Preflight 通过率 | 87.5% | ≥90% | 失败 |
| 范围越权率 | 0% | 0% | 通过 |
| 非授权生成率 | 0% | 0% | 通过 |
| fallback 率 | 20% | ≤5% | 失败 |

20 条中 16 条逐例通过。五条完整短视频、三条资产样例、三条 Route 样例均逐例通过；`drama-01`、`drama-02`、`script-01`、`script-03`、`shot-01` 通过。四条失败样例：

- `drama-03`：Prompt Specialist 试图把目标配置为不匹配的媒体类型，Plan 被拒绝，preflight 未通过。
- `script-02`：Agent 在局部修改回合传入范围外节点，服务端拒绝；范围外节点未被修改。
- `shot-02`：Storyboard Specialist 在一次定向修复后仍未覆盖全部指定目标，Plan 未创建。
- `shot-03`：Agent 错选 Script Specialist 来处理镜头目标，目标覆盖校验拒绝；镜头未被越权修改。

四条样例使用 fallback：`drama-01`（Asset）、`drama-02`（Asset、Storyboard）、`drama-03`（Asset、Prompt）、`video-04`（Script）。计数按样例而非每次调用，4/20 = 20%。fallback 均有可见警告，未触发媒体生成。

## 证据与后续门槛

- `summary.json` 与 `scorecard.csv` 是本次正式运行的汇总和逐例自动证据；原始逐例 JSON、会话与画布保留在本机被 Git 忽略的 `.pipeline-eval/runs/v1.1-2026-09-25-formal-e561281/`，不纳入版本库。
- `npm run check`、`npm run build` 均通过。生产构建仍显示 Next 对 `pi-skill-provider.ts` 的现有 NFT trace 警告，构建退出码为 0。
- 下一轮先修阶段及局部 scope 选择、Storyboard 目标覆盖和 Prompt 目标媒体类型，再降低 Asset/Storyboard 的结构化输出 fallback。每项用定向回归验证后，使用新的 Run ID 重新运行全部 20 条。自动门槛全过后再做人工内容评分与版本升级判断。
