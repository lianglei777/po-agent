import { AntDesignProvider } from "@/components/providers/ant-design-provider";
import { I18nProvider } from "@/i18n/i18n-provider";
import { WorkspaceModeRoot } from "@/layouts/workspace-mode-root";
import { AccessControlGate } from "@/features/access-control/access-control-gate";

export default function Home() {
  return (
    <I18nProvider>
      <AntDesignProvider>
        <AccessControlGate>
          <WorkspaceModeRoot />
        </AccessControlGate>
      </AntDesignProvider>
    </I18nProvider>
  );
}
