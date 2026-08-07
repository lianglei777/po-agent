"use client";

import { Divider, type DividerProps } from "antd";

type SeparatorProps = Omit<DividerProps, "orientation"> & {
  decorative?: boolean;
  orientation?: "horizontal" | "vertical";
};

function Separator({
  decorative: _decorative,
  orientation = "horizontal",
  style,
  ...props
}: SeparatorProps) {
  void _decorative;
  return (
    <Divider
      data-slot="separator"
      orientation={orientation}
      style={{ margin: 0, ...style }}
      {...props}
    />
  );
}

export { Separator };
