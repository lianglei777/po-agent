"use client";

import { App, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/use-i18n";

export function AntDesignProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();

  return (
    <ConfigProvider
      componentSize="middle"
      locale={locale === "zh" ? zhCN : enUS}
      theme={{ cssVar: { prefix: "ant" } }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
