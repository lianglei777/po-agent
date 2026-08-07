"use client";

import { Select as AntSelect } from "antd";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

type SelectProps = {
  children: ReactNode;
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  value?: string;
};

type SelectTriggerProps = {
  "aria-label"?: string;
  children?: ReactNode;
  className?: string;
  density?: "default" | "compact";
};

type SelectContentProps = {
  children?: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
};

type SelectItemProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  value: string;
};

function Select({
  children,
  defaultValue,
  disabled,
  onValueChange,
  value,
}: SelectProps) {
  let trigger: ReactElement<SelectTriggerProps> | null = null;
  let content: ReactElement<SelectContentProps> | null = null;

  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    if (child.type === SelectTrigger) {
      trigger = child as ReactElement<SelectTriggerProps>;
    }
    if (child.type === SelectContent) {
      content = child as ReactElement<SelectContentProps>;
    }
  }

  const options = Children.toArray(content?.props.children)
    .filter(
      (child): child is ReactElement<SelectItemProps> =>
        isValidElement(child) && child.type === SelectItem,
    )
    .map((item) => ({
      disabled: item.props.disabled,
      label: item.props.children,
      value: item.props.value,
    }));

  return (
    <AntSelect<string>
      aria-label={trigger?.props["aria-label"]}
      className={trigger?.props.className}
      classNames={{ popup: { root: content?.props.className ?? "" } }}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={onValueChange}
      options={options}
      placement={content?.props.side === "top" ? "topLeft" : "bottomLeft"}
      size={trigger?.props.density === "default" ? "middle" : "small"}
      value={value}
    />
  );
}

function SelectValue(_props: { placeholder?: ReactNode }) {
  void _props;
  return null;
}

function SelectTrigger(_props: SelectTriggerProps) {
  void _props;
  return null;
}

function SelectContent(_props: SelectContentProps) {
  void _props;
  return null;
}

function SelectItem(_props: SelectItemProps) {
  void _props;
  return null;
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
