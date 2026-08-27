import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { Noto_Sans_Mono } from "next/font/google";
import "./globals.css";

const notoSansMono = Noto_Sans_Mono({
  variable: "--font-noto-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Po Agent",
  description: "Local desktop workspace for the Pi coding agent — manage sessions, inspect files, and configure models.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      className={`${notoSansMono.variable} dark`}
      suppressHydrationWarning
    >
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
