import { AlertTriangle, Package } from "@/components/icons";
import { Tag } from "antd";
import { useI18n } from "@/i18n/use-i18n";
import type { SkillPackInfo } from "./types";

export function SkillPackList({
  packs,
  selectedPackId,
  onSelect,
}: {
  packs: SkillPackInfo[];
  selectedPackId: string | null;
  onSelect: (packId: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div
      aria-label={t.skills.packs.tabPacks}
      className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2"
      role="listbox"
    >
      {packs.map((pack) => {
        const selected = pack.packId === selectedPackId;
        const copy = packCopy(pack);
        return (
          <button
            aria-selected={selected}
            className="mb-0.5 w-full rounded-md py-[5px] pl-2 pr-2 text-left hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            key={pack.packId}
            onClick={() => onSelect(pack.packId)}
            role="option"
            style={{ background: selected ? "var(--bg-selected)" : undefined }}
            type="button"
          >
            <span className="flex items-start gap-[7px]">
              {pack.status === "broken" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <Package className="mt-0.5 size-4 shrink-0 text-accent-deep" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {copy.name}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Tag
                    color={
                      pack.status === "installed"
                        ? "success"
                        : pack.status === "broken"
                          ? "error"
                          : undefined
                    }
                    variant={pack.status === "available" ? "outlined" : "filled"}
                  >
                    {statusLabel(pack.status, t.skills.packs)}
                  </Tag>
                  <span className="text-meta text-muted">
                    {t.skills.packs.skillCount.replace(
                      "{count}",
                      String(pack.resources.skills.length),
                    )}
                  </span>
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function packCopy(pack: SkillPackInfo) {
  return { name: pack.name, description: pack.description };
}

export function statusLabel(
  status: SkillPackInfo["status"],
  t: ReturnType<typeof useI18n>["t"]["skills"]["packs"],
): string {
  if (status === "installed") return t.statusInstalled;
  if (status === "broken") return t.statusBroken;
  return t.statusAvailable;
}
