"use client";

import { Button, Popover, Select } from "antd";
import { QuestionCircle } from "@/components/icons";
import type { GenerationRouteDto } from "@/contracts/generation";

export function GenerationRouteTags({
  tags,
  limit = 3,
  className = "",
  wrapLabels = false,
}: {
  tags: string[];
  limit?: number;
  className?: string;
  wrapLabels?: boolean;
}) {
  const visible = tags.slice(0, limit);
  const remaining = tags.length - visible.length;
  return (
    <div className={`flex min-w-0 flex-wrap gap-1 ${className}`.trim()}>
      {visible.map((tag) => (
        <span
          className={`${wrapLabels ? "whitespace-normal text-caption" : "max-w-full truncate text-[10px] leading-4"} rounded-control border border-line-subtle bg-subtle px-1.5 py-0.5 text-muted`}
          key={tag}
          title={tag}
        >
          {tag}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="px-1 py-0.5 text-[10px] leading-4 tabular-nums text-dim">
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}

export function GenerationRouteDetails({
  route,
  tagLimit = 5,
  className = "",
}: {
  route: GenerationRouteDto;
  tagLimit?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <p className="text-xs leading-5 text-muted">{route.description}</p>
      <GenerationRouteTags limit={tagLimit} tags={route.tags} />
    </div>
  );
}

export function GenerationRouteInfo({
  route,
  label,
  getPopupContainer,
}: {
  route: GenerationRouteDto | undefined;
  label: string;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
}) {
  if (!route) return null;
  return (
    <Popover
      arrow={false}
      content={(
        <section className="w-80 space-y-2" aria-label={label}>
          <div>
            <p className="text-xs font-semibold text-primary">{route.name}</p>
            <p className="mt-0.5 text-caption text-dim">{route.product}</p>
          </div>
          <GenerationRouteDetails route={route} />
        </section>
      )}
      getPopupContainer={getPopupContainer}
      placement="top"
      trigger="click"
    >
      <Button
        aria-label={label}
        className="size-8 text-muted"
        htmlType="button"
        icon={<QuestionCircle className="size-3.5" />}
        size="small"
        type="text"
      />
    </Popover>
  );
}

export function GenerationRouteSelect({
  routes,
  value,
  ariaLabel,
  disabled,
  className,
  onChange,
  getPopupContainer,
}: {
  routes: GenerationRouteDto[];
  value: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onChange: (routeId: string) => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
}) {
  const groups = Array.from(new Set(routes.map((route) => route.product))).map((product) => ({
    label: product,
    options: routes
      .filter((route) => route.product === product)
      .map((route) => ({ label: route.name, value: route.id })),
  }));
  return (
    <Select
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      getPopupContainer={getPopupContainer}
      onChange={onChange}
      optionRender={(option) => {
        const route = routes.find((candidate) => candidate.id === option.value);
        return route ? (
          <div className="min-w-0 py-1">
            <p className="truncate text-xs font-medium text-primary">{route.name}</p>
            <GenerationRouteTags className="mt-1" limit={2} tags={route.tags} />
          </div>
        ) : option.label;
      }}
      options={groups}
      popupMatchSelectWidth={360}
      value={value}
    />
  );
}
