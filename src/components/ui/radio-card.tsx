"use client";

import { Radio, type RadioProps } from "antd";
import type { ReactNode } from "react";

function RadioCard({ children, ...props }: RadioProps & { children: ReactNode }) {
  return (
    <Radio className="ant-radio-card" {...props}>
      {children}
    </Radio>
  );
}

export { RadioCard };
