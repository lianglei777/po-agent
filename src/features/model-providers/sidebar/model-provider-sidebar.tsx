"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";
import type {
  ApiKeyProvider,
  ModelsJson,
  Selection,
} from "../types";
import { useI18n } from "@/i18n/use-i18n";
import { Brain, ChevronRight, Plus, Server } from "@/components/icons";
import {
  getSelectionKey,
  isProviderCollapsed,
} from "./model-provider-sidebar-state";
import { ProviderIcon } from "./provider-icon";

interface Props {
  config: ModelsJson;
  apiKeyProviders: ApiKeyProvider[];
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
  onAddProvider: () => void;
}

export function ModelProviderSidebar({
  config,
  apiKeyProviders,
  selection,
  onSelect,
  onAddProvider,
}: Props) {
  const providers = Object.entries(config.providers ?? {});
  const [collapsedProviderNames, setCollapsedProviderNames] = useState(
    () => new Set<string>(),
  );
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const { t } = useI18n();
  const selectionKey = getSelectionKey(selection);

  useEffect(() => {
    if (!selectionKey) return;
    const frame = window.requestAnimationFrame(() => {
      itemRefs.current
        .get(selectionKey)
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectionKey]);

  function setItemRef(key: string) {
    return (node: HTMLButtonElement | null) => {
      if (node) {
        itemRefs.current.set(key, node);
      } else {
        itemRefs.current.delete(key);
      }
    };
  }

  function toggleProviderCollapsed(providerName: string) {
    setCollapsedProviderNames((current) => {
      const next = new Set(current);
      if (next.has(providerName)) next.delete(providerName);
      else next.add(providerName);
      return next;
    });
  }

  return (
    <aside className="flex w-[224px] shrink-0 flex-col border-r border-line-subtle">
      <div className="flex-1 overflow-y-auto px-1.5 py-2">
        <Button
          htmlType="button"
          icon={<Plus />}
          className="mb-1.5 w-full"
          onClick={onAddProvider}
        >
          {t.models.addProvider}
        </Button>
        <div className="mb-2 border-t border-line-subtle" />

        {apiKeyProviders
          .filter((provider) => provider.configured)
          .map((provider) => (
            <NavButton
              key={`apikey-${provider.id}`}
              itemRef={setItemRef(`apikey:${provider.id}`)}
              selected={
                selection?.type === "apikey" &&
                selection.providerId === provider.id
              }
              onClick={() =>
                onSelect({ type: "apikey", providerId: provider.id })
              }
            >
              <ProviderIcon id={provider.id} size={16} />
              <span className="truncate text-xs text-primary">
                {provider.name}
              </span>
            </NavButton>
          ))}

        {/* {(oauthProviders.length > 0 ||
          apiKeyProviders.some((provider) => provider.configured)) &&
          providers.length > 0 && (
            <div className="mx-2 my-1 border-t border-line-subtle" />
          )} */}

        {providers.map(([providerName, provider]) => {
          const collapsed = isProviderCollapsed(
            collapsedProviderNames,
            providerName,
            selection,
          );
          return (
            <div key={providerName} className="mb-0.5">
              <ProviderNavRow
                collapsed={collapsed}
                itemRef={setItemRef(`provider:${providerName}`)}
                label={providerName}
                selected={
                  selection?.type === "provider" &&
                  selection.name === providerName
                }
                onClick={() =>
                  onSelect({ type: "provider", name: providerName })
                }
                onToggle={() => toggleProviderCollapsed(providerName)}
                toggleLabel={
                  collapsed
                    ? t.models.expandProvider
                    : t.models.collapseProvider
                }
              />
              {!collapsed &&
                (provider.models ?? []).map((model, index) => (
                  <NavButton
                    key={`${providerName}-${index}`}
                    itemRef={setItemRef(`model:${providerName}:${index}`)}
                    inset
                    selected={
                      selection?.type === "model" &&
                      selection.providerName === providerName &&
                      selection.index === index
                    }
                    onClick={() =>
                      onSelect({ type: "model", providerName, index })
                    }
                  >
                    <span className="truncate text-meta text-muted">
                      {model.id}
                    </span>
                    {model.reasoning !== false ? (
                      <Tooltip title={t.models.reasoningThinking}>
                        <span className="ml-auto inline-flex text-accent-hover">
                          <Brain aria-hidden="true" className="size-3.5" />
                        </span>
                      </Tooltip>
                    ) : null}
                  </NavButton>
                ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function ProviderNavRow({
  collapsed,
  itemRef,
  label,
  selected,
  onClick,
  onToggle,
  toggleLabel,
}: {
  collapsed: boolean;
  itemRef: (node: HTMLButtonElement | null) => void;
  label: string;
  selected: boolean;
  onClick: () => void;
  onToggle: () => void;
  toggleLabel: string;
}) {
  return (
    <div
      className="flex items-center rounded-md hover:bg-hover"
      style={{ background: selected ? "var(--bg-selected)" : undefined }}
    >
      <button
        type="button"
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="flex h-[26px] w-[22px] shrink-0 items-center justify-center rounded-md text-dim hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={`transition-transform duration-[var(--motion-fast)] ${
            collapsed ? "" : "rotate-90"
          }`}
        />
      </button>
      <button
        type="button"
        ref={itemRef}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-[7px] rounded-md py-[5px] pr-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <ServerIcon />
        <span className="truncate font-ui-mono text-xs text-primary">
          {label}
        </span>
      </button>
    </div>
  );
}

function ServerIcon() {
  return (
    <Server
      size={11}
      className="shrink-0 text-dim"
      aria-hidden="true"
    />
  );
}

function NavButton({
  children,
  itemRef,
  selected,
  inset = false,
  onClick,
}: {
  children: React.ReactNode;
  itemRef?: (node: HTMLButtonElement | null) => void;
  selected: boolean;
  inset?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      ref={itemRef}
      onClick={onClick}
      className={`flex w-full items-center gap-[7px] rounded-md py-[5px] pr-2 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
        inset ? "pl-[26px]" : "pl-2"
      }`}
      style={{ background: selected ? "var(--bg-selected)" : undefined }}
    >
      {children}
    </button>
  );
}
