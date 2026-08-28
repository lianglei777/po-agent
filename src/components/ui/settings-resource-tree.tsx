"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronRight } from "@/components/icons";

export interface SettingsResourceTreeNode {
  key: string;
  label: string;
  icon?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  selectable?: boolean;
  children?: SettingsResourceTreeNode[];
}

export function SettingsResourceTree({
  ariaLabel,
  collapseLabel,
  expandLabel,
  initialCollapsedKeys = [],
  nodes,
  onSelect,
  selectedKey,
}: {
  ariaLabel: string;
  collapseLabel: (label: string) => string;
  expandLabel: (label: string) => string;
  initialCollapsedKeys?: string[];
  nodes: SettingsResourceTreeNode[];
  onSelect: (key: string) => void;
  selectedKey: string | null;
}) {
  const [collapsedKeys, setCollapsedKeys] = useState(
    () => new Set(initialCollapsedKeys),
  );

  function toggle(key: string) {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <nav aria-label={ariaLabel} className="flex-1 overflow-y-auto px-2 py-2">
      {nodes.map((node) => (
        <ResourceTreeNode
          collapsedKeys={collapsedKeys}
          collapseLabel={collapseLabel}
          depth={0}
          expandLabel={expandLabel}
          key={node.key}
          node={node}
          onSelect={onSelect}
          onToggle={toggle}
          selectedKey={selectedKey}
        />
      ))}
    </nav>
  );
}

function ResourceTreeNode({
  collapsedKeys,
  collapseLabel,
  depth,
  expandLabel,
  node,
  onSelect,
  onToggle,
  selectedKey,
}: {
  collapsedKeys: ReadonlySet<string>;
  collapseLabel: (label: string) => string;
  depth: number;
  expandLabel: (label: string) => string;
  node: SettingsResourceTreeNode;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
  selectedKey: string | null;
}) {
  const hasChildren = Boolean(node.children?.length);
  const collapsed = collapsedKeys.has(node.key);
  const selectable = node.selectable !== false;
  const selected = selectable && node.key === selectedKey;
  const insetClass = depth === 0 ? "pl-1" : depth === 1 ? "pl-5" : "pl-9";

  return (
    <div className="mb-0.5">
      <div className={`group flex min-h-8 items-center rounded-control transition-colors hover:bg-hover motion-reduce:transition-none ${selected ? "bg-selected" : ""} ${insetClass}`}>
        {hasChildren ? (
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? expandLabel(node.label) : collapseLabel(node.label)}
            className="flex size-7 shrink-0 items-center justify-center rounded-sm text-dim hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onToggle(node.key)}
            type="button"
          >
            <ChevronRight aria-hidden className={`size-3.5 transition-transform motion-reduce:transition-none ${collapsed ? "" : "rotate-90"}`} />
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <button
          aria-current={selected ? "page" : undefined}
          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectable ? "" : "cursor-default"}`}
          onClick={() => selectable ? onSelect(node.key) : hasChildren && onToggle(node.key)}
          type="button"
        >
          {node.icon ? <span className="shrink-0 text-dim">{node.icon}</span> : null}
          <span className={`min-w-0 flex-1 truncate ${depth === 0 ? "text-sm font-medium text-primary" : "text-meta text-muted"}`} title={node.label}>
            {node.label}
          </span>
          {node.meta ? <span className="shrink-0 text-caption tabular-nums text-dim">{node.meta}</span> : null}
          {node.status ? <span className="flex shrink-0 items-center">{node.status}</span> : null}
        </button>
      </div>
      {hasChildren && !collapsed ? node.children?.map((child) => (
        <ResourceTreeNode
          collapsedKeys={collapsedKeys}
          collapseLabel={collapseLabel}
          depth={depth + 1}
          expandLabel={expandLabel}
          key={child.key}
          node={child}
          onSelect={onSelect}
          onToggle={onToggle}
          selectedKey={selectedKey}
        />
      )) : null}
    </div>
  );
}
