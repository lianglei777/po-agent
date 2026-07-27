"use client";

import { Button } from "@/components/ui/button";
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
            className="h-7 shrink-0 px-2"
            onClick={status.onRetry}
            size="sm"
            type="button"
            variant="outline"
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
    <div
      className={mergeClasses(
        "min-w-24 text-right text-xs",
        status.phase === "saved"
          ? "text-accent-deep"
          : status.phase === "pending"
            ? "text-dim"
            : "text-muted",
        className,
      )}
      role="status"
    >
      {label}
    </div>
  );
}
