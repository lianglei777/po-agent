"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { Popover } from "antd";
import type { CanvasMediaType } from "@/contracts/pipeline";
import { FileImage, FileMusic, FileText, FileVideo } from "@/components/icons";

type ThumbnailSize = "inline" | "browser" | "strip";

const SIZE_CLASS: Record<ThumbnailSize, string> = {
  inline: "size-5 rounded-[4px]",
  browser: "size-9 rounded-md",
  strip: "size-14 rounded-lg",
};

const IMAGE_SIZE: Record<ThumbnailSize, string> = {
  inline: "20px",
  browser: "36px",
  strip: "56px",
};

export function ResourcePreviewThumbnail({
  mediaType,
  label,
  url,
  poster,
  size,
  badge,
  fallback,
  accessible = false,
  fit = "cover",
}: {
  mediaType: CanvasMediaType;
  label: string;
  url: string | null;
  poster?: string;
  size: ThumbnailSize;
  badge?: number;
  fallback?: ReactNode;
  accessible?: boolean;
  fit?: "cover" | "contain";
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = !url || failedSource === url;
  const Icon = mediaType === "text" ? FileText : mediaType === "image" ? FileImage : mediaType === "video" ? FileVideo : FileMusic;
  // next/image fill 不参与父元素尺寸计算；缩略图框必须始终生成可计算的布局盒子。
  const frameClass = `relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-[var(--pl-border)] bg-[var(--pl-surface)] ${SIZE_CLASS[size]}`;

  let content: ReactNode;
  if (mediaType === "image" && !failed) {
    content = (
      <Image
        src={url}
        alt={accessible ? label : ""}
        fill
        unoptimized
        sizes={IMAGE_SIZE[size]}
        className={fit === "contain" ? "object-contain" : "object-cover"}
        onError={() => setFailedSource(url)}
      />
    );
  } else if (mediaType === "video" && !failed) {
    content = (
      <>
        <video
          src={url}
          poster={poster}
          muted
          playsInline
          preload="metadata"
          aria-label={accessible ? label : undefined}
          aria-hidden={accessible ? undefined : true}
          className={fit === "contain" ? "size-full object-contain" : "size-full object-cover"}
          onError={() => setFailedSource(url)}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
          <FileVideo className={size === "inline" ? "size-2.5 text-white/90" : "size-3.5 text-white/90"} />
        </span>
      </>
    );
  } else {
    content = fallback ?? <Icon className={size === "inline" ? "size-3 text-[var(--pl-text-secondary)]" : "size-4 text-[var(--pl-text-secondary)]"} />;
  }

  return (
    <span className={frameClass}>
      {content}
      {badge ? (
        <span className="absolute left-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/75 text-caption font-semibold tabular-nums text-white">
          {badge}
        </span>
      ) : null}
    </span>
  );
}

export function ResourcePreviewPopover({
  mediaType,
  label,
  url,
  poster,
  detail,
  ariaLabel,
  children,
}: {
  mediaType: "image" | "video";
  label: string;
  url: string | null;
  poster?: string;
  detail: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  if (!url) return <>{children}</>;
  const preview = (
    <figure className="w-56 overflow-hidden rounded-xl bg-[var(--pl-surface-elevated)]">
      <div className="relative flex h-64 w-full items-center justify-center overflow-hidden rounded-lg bg-black/35">
        {mediaType === "image" ? (
          <Image src={url} alt={label} fill unoptimized sizes="224px" className="object-contain" />
        ) : (
          <video
            src={url}
            poster={poster}
            muted
            playsInline
            preload="metadata"
            aria-label={label}
            className="size-full object-contain"
          />
        )}
      </div>
      <figcaption className="flex items-center gap-2 px-1 pb-0.5 pt-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--pl-text)]">{label}</span>
        <span className="shrink-0 text-caption text-[var(--pl-text-muted)]">{detail}</span>
      </figcaption>
    </figure>
  );
  return (
    <Popover
      placement="topLeft"
      trigger={["hover", "focus"]}
      mouseEnterDelay={0.15}
      mouseLeaveDelay={0.08}
      content={preview}
      classNames={{ container: "!max-w-none !p-2" }}
      getPopupContainer={previewPopupContainer}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        className="block rounded-lg outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
      >
        {children}
      </button>
    </Popover>
  );
}

function previewPopupContainer(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>(".pipeline-studio-shell") ?? document.body;
}
