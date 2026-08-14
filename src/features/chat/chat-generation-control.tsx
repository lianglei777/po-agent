"use client";

import { useState } from "react";
import { Button, Divider, Popover, Radio, Switch, Tooltip } from "antd";
import { Images, QuestionCircle } from "@/components/icons";
import type {
  ComposerGenerationMode,
  GenerationRouteDto,
} from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";

type EnabledGenerationMode = Exclude<
  ComposerGenerationMode,
  { type: "chat" }
>;

export function ChatGenerationControl({
  disabled,
  generationReview,
  mode,
  onModeChange,
  onReviewChange,
  routes,
}: {
  disabled: boolean;
  generationReview: boolean;
  mode: ComposerGenerationMode;
  onModeChange: (mode: ComposerGenerationMode) => void;
  onReviewChange: (review: boolean) => void;
  routes: GenerationRouteDto[];
}) {
  const { t } = useI18n();
  const enabled = mode.type !== "chat";
  const [open, setOpen] = useState(false);
  const [lastEnabledMode, setLastEnabledMode] = useState<EnabledGenerationMode>(
    mode.type === "chat" ? { type: "generation-auto" } : mode,
  );
  const [lastSpecificRouteId, setLastSpecificRouteId] = useState<string | null>(
    mode.type === "generation-route" ? mode.routeId : null,
  );
  const selectedRoute = mode.type === "generation-route"
    ? routes.find((route) => route.id === mode.routeId)
    : undefined;
  const summary = enabled
    ? t.chat.input.generationEnabledSummary
        .replace(
          "{api}",
          selectedRoute?.name ?? t.chat.input.generationAutoRoute,
        )
        .replace(
          "{execution}",
          generationReview
            ? t.chat.input.generationReview
            : t.chat.input.generationDirect,
        )
    : t.chat.input.generationDisabledSummary;

  function toggleGeneration(checked: boolean) {
    if (!checked) {
      if (mode.type !== "chat") setLastEnabledMode(mode);
      onModeChange({ type: "chat" });
      return;
    }
    onModeChange(lastEnabledMode);
  }

  function selectMode(value: string) {
    const next: EnabledGenerationMode = {
      type: "generation-route",
      routeId: value,
    };
    setLastSpecificRouteId(value);
    setLastEnabledMode(next);
    onModeChange(next);
    setOpen(false);
  }

  function toggleAutomatic(checked: boolean) {
    if (checked) {
      const next = { type: "generation-auto" } as const;
      setLastEnabledMode(next);
      onModeChange(next);
      return;
    }
    const routeId =
      routes.find((route) => route.id === lastSpecificRouteId)?.id ??
      routes[0]?.id;
    if (!routeId) return;
    const next = { type: "generation-route", routeId } as const;
    setLastSpecificRouteId(routeId);
    setLastEnabledMode(next);
    onModeChange(next);
  }

  const content = (
    <div className="w-80">
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <p className="text-xs font-semibold text-primary">{t.chat.input.generationControl}</p>
          <HelpHint
            description={t.chat.input.generationCapabilityDescription}
            label={t.chat.input.generationControl}
          />
        </div>
        <Switch
          aria-label={t.chat.input.generationToggle}
          checked={enabled}
          disabled={!routes.length}
          onChange={toggleGeneration}
          size="small"
        />
      </div>

      {enabled ? (
        <>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <p className="text-xs font-medium text-primary">
                {t.chat.input.generationReview}
              </p>
              <HelpHint
                description={t.chat.input.generationReviewDescription}
                label={t.chat.input.generationReview}
              />
            </div>
            <Switch
              aria-label={t.chat.input.generationReview}
              checked={generationReview}
              onChange={onReviewChange}
              size="small"
            />
          </div>

          <div className="mt-3 flex items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <p className="text-xs font-medium text-primary">
                {t.chat.input.generationAutoRoute}
              </p>
              <HelpHint
                description={t.chat.input.generationAutoDescription}
                label={t.chat.input.generationAutoRoute}
              />
            </div>
            <Switch
              aria-label={t.chat.input.generationAutoRoute}
              checked={mode.type === "generation-auto"}
              onChange={toggleAutomatic}
              size="small"
            />
          </div>

          {mode.type === "generation-route" ? (
            <>
              <Divider className="my-3" />
              <p className="mb-1.5 text-caption font-medium text-muted">
                {t.chat.input.generationApi}
              </p>
              <Radio.Group
                className="max-h-64 w-full overflow-y-auto"
                onChange={(event) => selectMode(String(event.target.value))}
                value={mode.routeId}
              >
                {Array.from(new Set(routes.map((route) => route.providerId))).map(
                  (providerId) => (
                    <div className="mt-2" key={providerId}>
                      <p className="px-2 py-1 text-caption font-medium text-dim">
                        {providerId}
                      </p>
                      {routes
                        .filter((route) => route.providerId === providerId)
                        .map((route) => (
                          <label
                            className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 hover:bg-hover"
                            key={route.id}
                          >
                            <Radio value={route.id} />
                            <span className="min-w-0 truncate text-xs text-primary">
                              {route.name}
                            </span>
                          </label>
                        ))}
                    </div>
                  ),
                )}
              </Radio.Group>
            </>
          ) : null}
        </>
      ) : !routes.length ? (
        <p className="mt-3 rounded-control bg-subtle px-2.5 py-2 text-caption text-muted">
          {t.chat.input.generationNoApis}
        </p>
      ) : null}
    </div>
  );

  return (
    <Popover
      arrow={false}
      content={content}
      destroyOnHidden
      onOpenChange={setOpen}
      open={open}
      placement="topLeft"
      trigger="click"
    >
      <span
        className="inline-flex"
        title={disabled ? t.chat.input.generationUnavailableWhileBusy : summary}
      >
        <Button
          aria-label={t.chat.input.generationControl}
          aria-pressed={enabled}
          className="h-8 px-2.5 text-xs"
          color={enabled ? "primary" : "default"}
          disabled={disabled}
          htmlType="button"
          icon={<Images />}
          size="small"
          variant={enabled ? "filled" : "text"}
        >
          {t.chat.input.generationControl}
        </Button>
      </span>
    </Popover>
  );
}

function HelpHint({ description, label }: { description: string; label: string }) {
  const { t } = useI18n();
  return (
    <Tooltip placement="right" title={description}>
      <Button
        aria-label={t.chat.input.generationHelp.replace("{item}", label)}
        className="size-5 text-dim"
        htmlType="button"
        icon={<QuestionCircle className="size-3.5" />}
        size="small"
        type="text"
      />
    </Tooltip>
  );
}
