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
      theme={{
        cssVar: { prefix: "ant" },
        token: {
          // 基于 Ant Design v6 字体规范整体 +2px — 与 globals.css 的 --fs-* 变量保持同步
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 16,
          fontSizeSM: 14,
          fontSizeLG: 18,
          fontSizeXL: 22,
          fontSizeHeading1: 40,
          fontSizeHeading2: 32,
          fontSizeHeading3: 26,
          fontSizeHeading4: 22,
          fontSizeHeading5: 18,
          fontWeightStrong: 600,
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
