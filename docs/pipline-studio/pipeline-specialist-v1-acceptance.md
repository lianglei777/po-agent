# Pipeline Specialist V1 正式验收

更新时间：2026-09-24

## 1. 验收范围

V1 交付一个用户可见的 Pipeline Chat，由 Manager 根据语义按需调用 Script、Asset、Storyboard、Prompt 四个内部 Specialist。所有创作结果先形成结构化 draft，再编译为可审查的 Canvas Plan；用户仍在画布上编辑节点并手动启动付费生成。

V1 同时包含：

- `CanvasCreativeSpec` 的 script、asset、shot 三类规格；
- 四套可版本化 Profile 与严格 JSON 合同；
- 资产身份复用、镜头时长校验、Route 与引用归一化；
- Plan 原子应用、真实 nodeId 串联、重复调用保护；
- preflight 的缺失、复用、过期和跳过说明；
- Creative Spec Inspector 与 Shot List 同源视图；
- 20 个固定样例的端到端评估器和评分表。

## 2. 发布门槛

| 检查项 | 门槛 | 当前状态 |
| --- | ---: | --- |
| 固定样例 | 20 / 20 完成 | 20 / 20 通过 |
| 路由正确率 | >= 90% | 100% |
| 结构有效率 | >= 98% | 100% |
| Plan 通过率 | >= 95% | 100% |
| 资产重复率 | <= 5% | 0% |
| Preflight 通过率 | >= 90% | 100% |
| 范围越权率 | 0% | 0% |
| 非授权生成率 | 0% | 0% |
| `npm run check` | 通过 | 通过 |
| `npm run build` | 通过 | 通过 |

任何一项自动门槛未通过，V1 都不能标记为正式收口。聚焦样例可用于修复验证，但不能代替 20 用例结果。

## 3. 可靠性处理

- 每次 Specialist 调用最多进行一次结构修复。
- 外部模型请求有 180 秒独立超时，并继承 Agent 回合取消信号。
- 模型结构输出仍不可用时，由对应 Specialist 服务生成带警告的保守结构化草案；草案仍必须通过同一编译器、Plan 校验和 preflight。
- Prompt Route 会删除无效媒体引用，校正不属于 Schema 的设置，并把非法枚举值映射到最接近的合法选项或默认值。
- 回退不是静默成功。结果包含 `*_OUTPUT_FALLBACK` 或 `PIPELINE_*_AUTO_CORRECTED` 警告，用户可继续编辑。

## 4. 人工评审方法

对完整短视频、完整短剧、单独 Specialist、局部修改、Route 引用各抽取至少一个结果，按 1 至 5 分检查：

1. 剧本结构和目标时长；
2. 资产身份、复用和连续性；
3. 镜头是否可制作；
4. Prompt 与 Route 是否匹配；
5. 画布是否清楚、可读、可局部修改；
6. scope、用户原文和手动生成边界是否保留。

人工评分必须基于落盘证据填写，不对未检查的样例补分。

## 5. 已确认的边界

- V1 不创建四个用户可见 Agent 或四个独立会话。
- Specialist 不创建 Generation Run，不直接调用付费媒体生成。
- Assembly、跨项目资产库、独立 Continuity Agent 和独立 Audio Agent 属于后续方向。
- Shot List 已作为 Canvas Shot Spec 的同源编辑视图交付，不新增第二套镜头数据。

## 6. 正式证据

本次正式证据位于 `resources/pipeline-specialists/evaluation/results/v1-2026-09-24-final-r2/`：

- `summary.json`：自动指标与门槛；
- `scorecard.csv`：逐例自动指标与人工评分；
- `review.md`：抽样证据、已知限制和评审结论。

运行期项目数据库、模型会话和可能包含用户内容的原始文件不进入版本库。

## 7. 验收结论

Pipeline Specialist V1 于 2026-09-24 达到发布门槛，可以正式收口。固定矩阵中的最后一个重型短剧会话超过评估器原 30 分钟等待上限，但 Agent 在 41 秒后完成，最终画布、工具调用和 preflight 均可读取。评估器增加了只读恢复已结束会话的能力，并基于同一落盘会话重新计算该用例，没有重新执行或补造结果。

人工抽样确认了完整短视频、多集短剧、单独 Specialist、局部修改和 Route 引用。模型发生结构化输出降级时，系统能够产生可编辑计划并保留警告；部分降级镜头的创作区分度仍有限，属于后续 Profile 质量优化项，不影响 V1 的结构、范围和手动生成边界。
