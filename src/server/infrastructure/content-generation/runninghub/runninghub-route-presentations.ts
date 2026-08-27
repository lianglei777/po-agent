export interface RunningHubRoutePresentation {
  description: string;
  tags: string[];
}

const PRESENTATIONS: Readonly<Record<string, RunningHubRoutePresentation>> = {
  "seedream-v5-pro-image-to-image": {
    description: "多参考图图像编辑接口，单次最多上传 10 张参考图，支持原图结构锁定、局部重绘、风格迁移和透明素材导出，适合人像改风格、产品改版、多素材融合与老照片修复。",
    tags: ["最多10张参考图", "结构锁定", "重绘强度可调", "透明图层导出"],
  },
  "seedream-v5-pro-text-to-image": {
    description: "纯文本驱动的商用图像生成接口，支持 1024–2048 自定义分辨率、PNG/JPG 输出与多语种文字渲染，适合海报、产品图和信息长图。",
    tags: ["单张输出", "PNG/JPG", "最高2K", "多语种文字"],
  },
  "seedance-2-5-text-to-video": {
    description: "Seedance 2.5 标准版文生视频，支持原生 480p/720p、高清超分、音画同出以及灵活的画幅和时长，按 Token 计费。",
    tags: ["Token计费", "音画同出", "最高4K超分", "智能时长", "多种画幅"],
  },
  "seedance-2-5-multimodal-video": {
    description: "Seedance 2.5 标准版多模态视频，支持图片、视频和音频组合参考，也支持 Prompt 与纯音频驱动，按 Token 计费。",
    tags: ["Token计费", "音画同出", "最高4K超分", "智能时长", "多模态参考"],
  },
  "seedance-2-5-image-to-video": {
    description: "Seedance 2.5 标准版图生视频，支持首帧或首尾帧驱动、原生 480p/720p、高清超分和音画同出，按 Token 计费。",
    tags: ["Token计费", "首帧/首尾帧", "音画同出", "最高4K超分", "智能时长"],
  },
  "seedance-2-multimodal-video": {
    description: "Seedance 2.0 多模态视频，面向高品质生成，支持文本、图片、视频和音频组合参考，以及视频编辑和续写。",
    tags: ["高品质生成", "多模态参考", "视频编辑与续写", "4–15秒"],
  },
  "seedance-2-image-to-video": {
    description: "Seedance 2.0 图生视频，支持首帧和首尾帧两种驱动方式，将静态图片转换为 4–15 秒动态影像，并可生成有声视频。",
    tags: ["高品质生成", "首帧/首尾帧", "4–15秒", "有声视频", "多种画幅"],
  },
  "seedance-2-text-to-video": {
    description: "Seedance 2.0 文生视频，仅需文本提示词即可生成 4–15 秒高质量视频，支持多种画幅、有声视频和联网搜索增强。",
    tags: ["高品质生成", "纯文本驱动", "4–15秒", "联网增强", "有声视频"],
  },
  "minimax-hailuo-h3-multimodal-video": {
    description: "MiniMax H3（Hailuo-03）多模态参考生视频，支持文本与参考图、参考视频、参考音频组合驱动，可 2K 直出。",
    tags: ["图/视/音参考", "2K直出", "5–15秒"],
  },
  "minimax-hailuo-h3-text-to-video": {
    description: "MiniMax H3（Hailuo-03）文生视频，支持 2K 直出、5–15 秒时长和多种画幅。",
    tags: ["文生视频", "2K直出", "5–15秒"],
  },
  "minimax-hailuo-h3-image-to-video": {
    description: "MiniMax H3（Hailuo-03）图生视频，支持首帧、尾帧或首尾帧驱动，宽高比由输入图决定，可 2K 直出。",
    tags: ["首帧/尾帧", "2K直出", "5–15秒"],
  },
  "pixverse-v6-text-to-video": {
    description: "PixVerse V6 文生视频支持 360p 至 1080p、1–15 秒时长和八种画幅；Thinking 模式可优化复杂描述，并可同步生成音频。",
    tags: ["电影级画质", "1–15秒", "最高1080p", "Thinking模式", "同步音频"],
  },
  "pixverse-v6-image-to-video": {
    description: "PixVerse V6 图生视频可保持参考图片的主体外观与构图，生成自然流畅的视频，支持提示增强、Thinking 模式和同步音频。",
    tags: ["图片精准控制", "自然运动", "1–15秒", "最高1080p", "Thinking模式"],
  },
  "wan-2-7-text-to-video": {
    description: "Wan 2.7 文生视频可将自然语言转为动态稳定的高清影像，支持音频节奏、负向提示词和智能提示词扩展。",
    tags: ["电影级画质", "音频节奏", "720P/1080P", "负向提示词", "提示词扩展"],
  },
  "wan-2-7-image-to-video": {
    description: "Wan 2.7 图生视频支持单张首帧或首尾双帧控制，结合文本生成平滑过渡的高清画面，并支持音频驱动与负向提示词。",
    tags: ["首帧/首尾帧", "声画同步", "720P/1080P", "负向提示词", "最长15秒"],
  },
  "wan-2-7-reference-to-video": {
    description: "Wan 2.7 参考生视频可混合输入图片和视频，在新场景中保持角色、道具与视觉风格一致，支持最多 5 个参考素材。",
    tags: ["1–5个参考素材", "角色一致性", "多模态参考", "720P/1080P", "负向提示词"],
  },
  "wan-3-image-to-video": {
    description: "Wan 3.0 图生视频支持首帧和首尾帧控制，原生最长 30 秒，可选智能时长、多个分辨率、自适应画幅和有声输出。",
    tags: ["首帧/首尾帧", "最长30秒", "智能时长", "最高1080P", "有声输出"],
  },
  "wan-3-reference-to-video": {
    description: "Wan 3.0 参考生视频支持图片、视频、音频、文档和网页组合参考，提供长时生成、深度思考和有声输出。",
    tags: ["全能多模态", "最长30秒", "智能时长", "文档/网页解析", "有声输出"],
  },
};

export function runningHubRoutePresentation(
  operation: string,
): RunningHubRoutePresentation {
  const presentation = PRESENTATIONS[operation];
  if (!presentation) {
    throw new Error(`Missing RunningHub route presentation: ${operation}`);
  }
  return presentation;
}
