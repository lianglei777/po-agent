"use client";

import { Skeleton as AntSkeleton } from "antd";
import type { ComponentProps } from "react";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <AntSkeleton.Node
      active
      className={className}
      data-slot="skeleton"
      {...props}
    >
      <span />
    </AntSkeleton.Node>
  );
}

export { Skeleton };
