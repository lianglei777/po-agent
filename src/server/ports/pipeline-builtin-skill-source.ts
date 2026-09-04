/**
 * Pipeline 内置示例 Skill 的可信来源。
 *
 * 应用层只按固定标识请求文件，具体资源路径仍由 infrastructure 层管理，避免把
 * 服务端资源路径暴露给浏览器或混入用户提交的本地导入路径。
 */
export interface PipelineBuiltinSkillSource {
  shortDrama(): Promise<string>;
}
