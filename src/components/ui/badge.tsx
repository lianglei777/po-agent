"use client";

import { Tag, type TagProps } from "antd";

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "destructive";

type BadgeProps = Omit<TagProps, "variant"> & {
  variant?: BadgeVariant;
};

function Badge({ children, variant = "default", ...props }: BadgeProps) {
  const color =
    variant === "success"
      ? "success"
      : variant === "destructive"
        ? "error"
        : undefined;

  return (
    <Tag
      color={color}
      data-slot="badge"
      variant={variant === "outline" ? "outlined" : "filled"}
      {...props}
    >
      {children}
    </Tag>
  );
}

export { Badge };
export type { BadgeProps, BadgeVariant };
