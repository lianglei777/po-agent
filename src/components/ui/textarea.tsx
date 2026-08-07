"use client";

import { Input } from "antd";
import type { TextAreaProps, TextAreaRef } from "antd/es/input/TextArea";
import { forwardRef } from "react";

type TextareaProps = TextAreaProps & {
  density?: "default" | "compact";
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { density = "default", size, ...props },
  ref,
) {
  return (
    <Input.TextArea
      data-slot="textarea"
      ref={(instance: TextAreaRef | null) => {
        // Chat Composer 依赖原生 textarea 的高度、选区和焦点能力。
        const element = instance?.resizableTextArea?.textArea ?? null;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      size={size ?? (density === "compact" ? "small" : "middle")}
      {...props}
    />
  );
});

export { Textarea };
export type { TextareaProps };
