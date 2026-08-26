"use client";

import { App, ConfigProvider, theme as antdTheme } from "antd";
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
        algorithm: antdTheme.darkAlgorithm,
        cssVar: { prefix: "ant" },
        token: {
          // 与 globals.css 的语义 Token 对齐，确保 Portal 和业务表面共享同一暗色层级。
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 14,
          fontSizeSM: 12,
          fontSizeLG: 16,
          fontSizeXL: 20,
          fontSizeHeading1: 28,
          fontSizeHeading2: 24,
          fontSizeHeading3: 20,
          fontSizeHeading4: 18,
          fontSizeHeading5: 16,
          fontWeightStrong: 600,
          borderRadius: 8,
          borderRadiusLG: 12,
          colorPrimary: "#1668dc",
          colorInfo: "#4096ff",
          colorBgBase: "#111317",
          colorBgLayout: "#0d0f12",
          colorBgContainer: "#15181c",
          colorBgElevated: "#1b1f24",
          colorBorder: "#343c46",
          colorBorderSecondary: "#252a31",
          colorText: "#f2f4f7",
          colorTextSecondary: "#a8b0ba",
          colorTextTertiary: "#747e8a",
          colorError: "#ff7875",
          colorWarning: "#e9b949",
          colorSuccess: "#49c98f",
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
