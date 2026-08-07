"use client";

import { Segmented } from "antd";

type SegmentedItem<T extends string> = {
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  items: Array<SegmentedItem<T>>;
  kind?: "tabs" | "radio";
  onValueChange: (value: T) => void;
  value: T;
};

function SegmentedControl<T extends string>({
  ariaLabel,
  className,
  items,
  onValueChange,
  value,
}: SegmentedControlProps<T>) {
  return (
    <Segmented<T>
      aria-label={ariaLabel}
      className={className}
      onChange={onValueChange}
      options={items}
      value={value}
    />
  );
}

export { SegmentedControl };
