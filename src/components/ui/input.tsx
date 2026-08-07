"use client";

import { Input as AntInput, type InputProps as AntInputProps } from "antd";
import type { InputRef } from "antd";
import { forwardRef } from "react";

type InputProps = AntInputProps & {
  density?: "default" | "compact";
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { density = "default", size, ...props },
  ref,
) {
  return (
    <AntInput
      data-slot="input"
      ref={(instance: InputRef | null) => {
        // 对外继续暴露原生 input，避免迁移破坏既有聚焦与文本选择逻辑。
        if (typeof ref === "function") ref(instance?.input ?? null);
        else if (ref) ref.current = instance?.input ?? null;
      }}
      size={size ?? (density === "compact" ? "small" : "middle")}
      {...props}
    />
  );
});

export { Input };
export type { InputProps };
