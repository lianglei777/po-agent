export const ENTITY_EXTRACTION_PROMPT = `你是一个剧本分析助手。请分析给定的剧本文本，提取其中的角色、场景和道具实体。

输出要求：
- 严格输出 JSON 格式，不要输出其他内容
- JSON 外层不要加 markdown 代码块标记
- 如果某个类别没有提取到，返回空数组

输出 schema:
{"characters":[{"name":"","description":"","age":"","gender":"","clothing":"","visualWeight":3,"persona":""}],"scenes":[{"name":"","description":"","timeOfDay":"","lightingMood":""}],"props":[{"name":"","description":""}]}

提取规则:
- 角色包括所有有名字或有台词的人物
- 场景包括所有出现的地点或环境
- 道具包括对剧情有推动作用的关键物品
- description 要包含足够的视觉信息，能直接用于 AI 图像生成的 prompt
- 同一角色的不同年龄段视为不同实体（不同 name）`;

export const STORYBOARD_EXTRACTION_PROMPT = `你是一个分镜导演。请将剧本片段转化为结构化分镜帧。

输出 JSON:
{"frames":[{"visualDescription":"","dialogue":{"speaker":"","line":"","emotion":"","delivery":""},"cameraMovement":{"primary":"","secondary":"","speed":"normal","description":""},"blocking":{"description":"","stage":[],"cameraRelation":""},"lighting":{"direction":"","quality":"","colorTemp":"","description":""},"audioNote":{"sfx":"","ambience":"","bgmNote":""},"shotSize":"","transitionHint":"","characterRefs":[],"sceneRef":"","propRefs":[]}]}

分镜原则:
- 每个分镜帧是一个独立的镜头
- visualDescription 要包含足够的视觉信息用于 AI 图像生成
- characterRefs/sceneRef/propRefs 中的名称必须与已提取的实体名称匹配
- 对白只在有台词时填写，无对白的帧 dialogue 设为 null
- 一个分镜帧的时长建议 3-8 秒`;

export const STORYBOARD_POLISH_PROMPT = `你是一个 AI 图像生成 prompt 工程师。请将以下分镜描述润色为高质量的图像生成 prompt。保留原始描述的核心视觉信息，补充光影、材质、构图细节。输出纯 prompt 文本。`;

export const VIDEO_POLISH_PROMPT = `你是一个 AI 视频生成 prompt 工程师。请将以下分镜描述润色为高质量的图生视频 (I2V) prompt。描述动态运动而非静态画面，包含角色动作、表情变化、镜头运动。输出纯 prompt 文本。`;

export const R2V_POLISH_PROMPT = `你是一个 AI 视频生成 prompt 工程师。请将以下分镜描述润色为高质量的参考生视频 (R2V) prompt。描述角色在场景中的动态表演，保持与参考图的角色一致性，包含运镜和动作描述。输出纯 prompt 文本。`;

export function parseEntityJson(raw: string): {
  characters: Array<{ name: string; description: string; age?: string; gender?: string; clothing?: string; visualWeight?: number; persona?: string }>;
  scenes: Array<{ name: string; description: string; timeOfDay?: string; lightingMood?: string }>;
  props: Array<{ name: string; description: string }>;
} {
  let cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  try { return JSON.parse(cleaned); } catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/'/g, '"');
    return JSON.parse(cleaned);
  }
}

export function parseStoryboardJson(raw: string): {
  frames: Array<Record<string, unknown>>;
} {
  let cleaned = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);
  try { return JSON.parse(cleaned); } catch {
    cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/'/g, '"');
    return JSON.parse(cleaned);
  }
}
