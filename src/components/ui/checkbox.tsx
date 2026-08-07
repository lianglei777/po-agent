"use client";

import {
  Checkbox as AntCheckbox,
  type CheckboxProps as AntCheckboxProps,
} from "antd";

type CheckboxProps = Omit<AntCheckboxProps, "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
};

function Checkbox({ onCheckedChange, ...props }: CheckboxProps) {
  return (
    <AntCheckbox
      data-slot="checkbox"
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  );
}

export { Checkbox };
export type { CheckboxProps };
