"use client";

import { Card } from "antd";
import type { ReactNode } from "react";
import { mergeClasses } from "@/lib/utils";

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-0.5 text-meta font-semibold text-muted">
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={mergeClasses("flex flex-col gap-2", className)}>
      <h2 className="px-0.5 text-body-sm font-semibold text-primary">
        {title}
      </h2>
      <Card
        className="overflow-hidden rounded-floating border-line-subtle bg-panel shadow-none"
        styles={{ body: { padding: 0 } }}
      >
        {children}
      </Card>
    </section>
  );
}

export function SettingsRow({
  label,
  labelFor,
  description,
  children,
  align = "center",
  compact = false,
  contentMaxWidth = 250,
}: {
  label: ReactNode;
  labelFor?: string;
  description?: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
  compact?: boolean;
  contentMaxWidth?: number;
}) {
  return (
    <div
      className={mergeClasses(
        "grid border-t border-line-subtle px-4 py-3 first:border-t-0",
        compact ? "gap-3" : "gap-6",
        align === "center" ? "items-center" : "items-start",
      )}
      style={{
        gridTemplateColumns: compact
          ? "minmax(0, 1fr)"
          : `minmax(160px,1fr) minmax(200px,${contentMaxWidth}px)`,
      }}
    >
      <div className="min-w-0">
        {labelFor ? (
          <label className="text-xs font-medium text-primary" htmlFor={labelFor}>
            {label}
          </label>
        ) : (
          <div className="text-xs font-medium text-primary">{label}</div>
        )}
        {description ? (
          <p className="mt-1 max-w-[54ch] text-meta leading-4 text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div
        className={mergeClasses(
          "min-w-0 w-full",
          compact ? "justify-self-stretch" : "justify-self-end",
        )}
        style={{ maxWidth: compact ? undefined : contentMaxWidth }}
      >
        {children}
      </div>
    </div>
  );
}
