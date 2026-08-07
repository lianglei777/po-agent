"use client";

import { Tooltip as AntTooltip, type TooltipProps as AntTooltipProps } from "antd";
import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

type TooltipTriggerProps = {
  asChild?: boolean;
  children: ReactNode;
};

type TooltipContentProps = {
  children: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
};

function TooltipProvider({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

function Tooltip({ children }: { children: ReactNode }) {
  let trigger: ReactNode = null;
  let content: ReactElement<TooltipContentProps> | null = null;

  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    if (child.type === TooltipTrigger) {
      trigger = (child as ReactElement<TooltipTriggerProps>).props.children;
    }
    if (child.type === TooltipContent) {
      content = child as ReactElement<TooltipContentProps>;
    }
  }

  const placement = content?.props.side ?? "top";
  return (
    <AntTooltip
      classNames={{ root: content?.props.className ?? "" }}
      mouseEnterDelay={0.35}
      placement={placement as AntTooltipProps["placement"]}
      title={content?.props.children}
    >
      {trigger}
    </AntTooltip>
  );
}

function TooltipTrigger({ children }: TooltipTriggerProps) {
  return <Fragment>{children}</Fragment>;
}

function TooltipContent(_props: TooltipContentProps) {
  void _props;
  return null;
}

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
};
