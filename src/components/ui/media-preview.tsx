import { Image } from "antd";

export function MediaPreview({
  className,
  contentType,
  name,
  src,
}: {
  className?: string;
  contentType: string;
  name: string;
  src: string;
}) {
  if (contentType.startsWith("video/")) {
    return (
      <div className={`grid min-h-0 flex-1 place-items-center overflow-auto bg-black p-3 ${className ?? ""}`}>
        <video
          aria-label={name}
          className="max-h-full max-w-full rounded-md"
          controls
          playsInline
          preload="metadata"
          src={src}
        />
      </div>
    );
  }
  if (contentType.startsWith("audio/")) {
    return (
      <div className={`grid min-h-0 flex-1 place-items-center p-6 ${className ?? ""}`}>
        <audio aria-label={name} className="w-full" controls preload="metadata" src={src} />
      </div>
    );
  }
  // 图片统一走 antd Image 内置预览（hover 遮罩、点击/回车放大），与聊天内其它图片行为保持一致。
  return (
    <div className={`grid min-h-0 flex-1 place-items-center overflow-auto p-3 ${className ?? ""}`}>
      <Image alt={name} className="max-h-full max-w-full object-contain" src={src} />
    </div>
  );
}
