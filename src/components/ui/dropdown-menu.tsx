"use client";

import { Dropdown, type MenuProps } from "antd";
import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

type DropdownMenuProps = { children: ReactNode };
type DropdownMenuTriggerProps = { asChild?: boolean; children: ReactNode };
type DropdownMenuContentProps = {
  align?: "start" | "center" | "end";
  children: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
};
type DropdownMenuItemProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onSelect?: () => void;
};

function DropdownMenu({ children }: DropdownMenuProps) {
  let trigger: ReactNode = null;
  let content: ReactElement<DropdownMenuContentProps> | null = null;

  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    if (child.type === DropdownMenuTrigger) {
      trigger = (child as ReactElement<DropdownMenuTriggerProps>).props.children;
    }
    if (child.type === DropdownMenuContent) {
      content = child as ReactElement<DropdownMenuContentProps>;
    }
  }

  const items: MenuProps["items"] = Children.toArray(content?.props.children)
    .filter(
      (child): child is ReactElement<DropdownMenuItemProps> =>
        isValidElement(child) && child.type === DropdownMenuItem,
    )
    .map((item, index) => ({
      danger: item.props.className?.includes("destructive"),
      disabled: item.props.disabled,
      key: item.key ?? String(index),
      label: item.props.children,
      onClick: item.props.onSelect,
    }));

  const placement =
    content?.props.side === "top"
      ? content.props.align === "end"
        ? "topRight"
        : "topLeft"
      : content?.props.align === "end"
        ? "bottomRight"
        : "bottomLeft";

  if (!isValidElement(trigger)) return null;
  return (
    <Dropdown
      classNames={{ root: content?.props.className ?? "" }}
      menu={{ items }}
      placement={placement}
      trigger={["click"]}
    >
      {trigger}
    </Dropdown>
  );
}

function DropdownMenuTrigger({ children }: DropdownMenuTriggerProps) {
  return <Fragment>{children}</Fragment>;
}

function DropdownMenuContent(_props: DropdownMenuContentProps) {
  void _props;
  return null;
}

function DropdownMenuItem(_props: DropdownMenuItemProps) {
  void _props;
  return null;
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
};
