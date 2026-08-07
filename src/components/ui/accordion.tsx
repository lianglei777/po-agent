"use client";

import { Collapse } from "antd";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

type AccordionProps = {
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  onValueChange?: (value: string) => void;
  type?: "single";
  value?: string;
};

type AccordionItemProps = {
  children: ReactNode;
  className?: string;
  value: string;
};

type AccordionPartProps = {
  children: ReactNode;
  className?: string;
};

function Accordion({ children, className, onValueChange, value }: AccordionProps) {
  const items = Children.toArray(children)
    .filter(
      (child): child is ReactElement<AccordionItemProps> =>
        isValidElement(child) && child.type === AccordionItem,
    )
    .map((item) => {
      let label: ReactNode = null;
      let content: ReactElement<AccordionPartProps> | null = null;
      for (const part of Children.toArray(item.props.children)) {
        if (!isValidElement(part)) continue;
        if (part.type === AccordionTrigger) {
          label = (part as ReactElement<AccordionPartProps>).props.children;
        }
        if (part.type === AccordionContent) {
          content = part as ReactElement<AccordionPartProps>;
        }
      }
      return {
        children: (
          <div className={content?.props.className}>{content?.props.children}</div>
        ),
        className: item.props.className,
        key: item.props.value,
        label,
      };
    });

  return (
    <Collapse
      accordion
      activeKey={value || undefined}
      className={className}
      items={items}
      onChange={(key) => onValueChange?.(Array.isArray(key) ? (key[0] ?? "") : key)}
      size="small"
    />
  );
}

function AccordionItem(_props: AccordionItemProps) {
  void _props;
  return null;
}

function AccordionTrigger(_props: AccordionPartProps) {
  void _props;
  return null;
}

function AccordionContent(_props: AccordionPartProps) {
  void _props;
  return null;
}

export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
};
