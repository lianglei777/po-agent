"use client";

import { SettingsResourceTree, type SettingsResourceTreeNode } from "@/components/ui/settings-resource-tree";
import { AlertTriangle, CheckCircle2, FileImage, FileVideo, Layers, Server } from "@/components/icons";
import type { GenerationProviderDescriptorDto, GenerationRouteDto } from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import {
  contentGenerationSelectionFromKey,
  contentGenerationSelectionKey,
  groupGenerationRoutesByProduct,
  type ContentGenerationSettingsSelection,
} from "./content-generation-settings-model";

export function ContentGenerationNavigator({
  credentialDraftProviderIds,
  onSelect,
  providers,
  routes,
  selection,
  width,
}: {
  credentialDraftProviderIds: ReadonlySet<string>;
  onSelect: (selection: ContentGenerationSettingsSelection) => void;
  providers: GenerationProviderDescriptorDto[];
  routes: GenerationRouteDto[];
  selection: ContentGenerationSettingsSelection | null;
  width: number;
}) {
  const { t } = useI18n();
  const labels = t.contentGeneration;
  const nodes = providers.map((provider): SettingsResourceTreeNode => {
    const providerRoutes = routes.filter((route) => route.providerId === provider.providerId);
    const groups = groupGenerationRoutesByProduct(providerRoutes);
    const enabledCount = providerRoutes.filter((route) => route.enabled).length;
    const missingCredential = Boolean(provider.credential && !provider.credential.hasCredential);
    const hasDraft = credentialDraftProviderIds.has(provider.providerId);
    return {
      key: `provider:${provider.providerId}`,
      label: provider.displayName,
      icon: <Server className="size-3.5" />,
      meta: `${enabledCount}/${providerRoutes.length}`,
      status: hasDraft ? (
        <span aria-label={labels.unsavedCredential} className="size-2 rounded-full bg-[var(--pl-accent)]" role="img" title={labels.unsavedCredential} />
      ) : missingCredential ? (
        <AlertTriangle aria-label={labels.credentialMissing} className="size-3.5 text-warning" />
      ) : (
        <span
          aria-label={provider.enabled ? labels.providerEnabledStatus : labels.providerDisabledStatus}
          className={`size-2 rounded-full ${provider.enabled ? "bg-success" : "bg-line-strong"}`}
          role="img"
          title={provider.enabled ? labels.providerEnabledStatus : labels.providerDisabledStatus}
        />
      ),
      children: groups.map((group) => ({
        key: `product:${provider.providerId}:${group.product}`,
        label: group.product,
        icon: <Layers className="size-3.5" />,
        meta: `${group.routes.filter((route) => route.enabled).length}/${group.routes.length}`,
        selectable: false,
        children: group.routes.map((route) => ({
          key: `route:${route.id}`,
          label: route.navigationLabel ?? route.capability,
          icon: route.capability.endsWith("-to-image")
            ? <FileImage className="size-3.5" />
            : <FileVideo className="size-3.5" />,
          status: route.isDefault ? (
            <CheckCircle2 aria-label={labels.defaultRoute} className="size-3.5 text-success-text" />
          ) : (
            <span
              aria-label={route.enabled ? labels.routeEnabled : labels.routeDisabled}
              className={`size-1.5 rounded-full ${route.enabled ? "bg-success" : "bg-line-strong"}`}
              role="img"
              title={route.enabled ? labels.routeEnabled : labels.routeDisabled}
            />
          ),
        })),
      })),
    };
  });

  return (
    <aside className="flex shrink-0 flex-col bg-canvas" style={{ width }}>
      <div className="border-b border-line-subtle px-4 py-3">
        <h2 className="text-sm font-semibold text-primary">{labels.providers}</h2>
        <p className="mt-0.5 text-caption text-muted">{labels.navigatorDescription}</p>
      </div>
      <SettingsResourceTree
        ariaLabel={labels.providers}
        collapseLabel={(label) => labels.collapseResource.replace("{resource}", label)}
        expandLabel={(label) => labels.expandResource.replace("{resource}", label)}
        initialCollapsedKeys={nodes.flatMap((provider) =>
          provider.children?.map((product) => product.key) ?? []
        )}
        nodes={nodes}
        onSelect={(key) => {
          const next = contentGenerationSelectionFromKey(key);
          if (next) onSelect(next);
        }}
        selectedKey={contentGenerationSelectionKey(selection)}
      />
    </aside>
  );
}
