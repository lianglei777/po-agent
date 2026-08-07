"use client";

import { Card as AntCard, type CardProps as AntCardProps } from "antd";
import type { HTMLAttributes } from "react";

function Card({ children, styles, ...props }: AntCardProps) {
  const resolvedStyles = typeof styles === "function" ? undefined : styles;
  return (
    <AntCard
      data-slot="card"
      styles={{
        ...resolvedStyles,
        body: { padding: 0, ...resolvedStyles?.body },
      }}
      {...props}
    >
      {children}
    </AntCard>
  );
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className} data-slot="card-content" {...props} />;
}

export { Card, CardContent };
