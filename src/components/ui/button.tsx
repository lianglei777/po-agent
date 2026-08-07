"use client";

import { Button as AntButton, type ButtonProps as AntButtonProps } from "antd";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

type ButtonSize = "default" | "sm" | "lg" | "icon" | "icon-sm";

type ButtonProps = Omit<
  AntButtonProps,
  "danger" | "htmlType" | "size" | "type" | "variant"
> & {
  size?: ButtonSize;
  type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  variant?: ButtonVariant;
};

function Button({
  children,
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  const antSize =
    size === "sm" || size === "icon-sm"
      ? "small"
      : size === "lg"
        ? "large"
        : "middle";
  const antType =
    variant === "default" || variant === "destructive"
      ? "primary"
      : variant === "ghost"
        ? "text"
        : variant === "link"
          ? "link"
          : "default";
  const antVariant = variant === "secondary" ? "filled" : undefined;

  return (
    <AntButton
      danger={variant === "destructive"}
      data-slot="button"
      htmlType={type}
      size={antSize}
      type={antType}
      variant={antVariant}
      {...props}
    >
      {children}
    </AntButton>
  );
}

export { Button };
export type { ButtonProps, ButtonSize, ButtonVariant };
