"use client";

import { Button, Tag } from "antd";
import type { ModelProviderSaveStatus } from "@/features/model-providers/model-provider-page";
import { useI18n } from "@/i18n/use-i18n";
import { mergeClasses } from "@/lib/utils";

export function ModelProviderSaveIndicator({
  className,
  status,
}: {
  className?: string;
  status?: ModelProviderSaveStatus;
}) {
  const { t } = useI18n();
  if (!status || status.phase === "idle") return null;

  if (status.phase === "error") {
    return (
      <div
        className={mergeClasses(
          "flex min-w-0 max-w-[420px] items-center gap-2 text-xs",
          className,
        )}
        role="alert"
      >
        <span
          className="min-w-0 truncate text-destructive-text"
          title={status.message}
        >
          {status.message}
        </span>
        {status.onRetry ? (
          <Button
            className="shrink-0"
            htmlType="button"
            onClick={status.onRetry}
            size="small"
          >
            {t.models.retrySave}
          </Button>
        ) : null}
      </div>
    );
  }

  const label =
    status.phase === "saving"
      ? t.models.autoSaving
      : status.phase === "pending"
        ? t.models.autoSavePending
        : t.models.autoSaved;

  return (
    <Tag
      className={mergeClasses(
        "min-w-24 text-center",
        className,
      )}
      color={status.phase === "saved" ? "success" : undefined}
      role="status"
      variant="filled"
    >
      {label}
    </Tag>
  );
}
