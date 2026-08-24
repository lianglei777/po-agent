import { AntDesignProvider } from "@/components/providers/ant-design-provider";
import { I18nProvider } from "@/i18n/i18n-provider";
import { WorkspaceModeRoot } from "@/layouts/workspace-mode-root";

export default function Home() {
  return (
    <I18nProvider>
      <AntDesignProvider>
        <WorkspaceModeRoot />
      </AntDesignProvider>
    </I18nProvider>
  );
}
