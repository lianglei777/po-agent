"use client";

import { Switch as AntSwitch, type SwitchProps as AntSwitchProps } from "antd";

type SwitchProps = Omit<AntSwitchProps, "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
};

function Switch({ onCheckedChange, ...props }: SwitchProps) {
  return (
    <AntSwitch
      data-slot="switch"
      onChange={(checked) => onCheckedChange?.(checked)}
      {...props}
    />
  );
}

export { Switch };
export type { SwitchProps };
