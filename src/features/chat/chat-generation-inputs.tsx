"use client";

import { Button } from "antd";
import { FileImage, FileMusic, FileVideo, X } from "@/components/icons";
import type { GenerationAssetSlot } from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import type { ChatGenerationAsset } from "./chat-generation-types";

export function ChatGenerationInputs({
  assets,
  disabled,
  slots,
  onAdd,
  onRemove,
}: {
  assets: ChatGenerationAsset[];
  disabled: boolean;
  slots: GenerationAssetSlot[];
  onAdd: (slot: GenerationAssetSlot, files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!slots.length) return null;
  const automatic = slots.every((slot) => slot.key.startsWith("auto-"));
  if (automatic) {
    const remaining = Math.max(0, 10 - assets.length);
    return (
      <div className="border-b border-line-subtle px-4 py-3">
        <div className="rounded-control border border-line-subtle bg-subtle px-2.5 py-2">
          <div className="flex items-center gap-2 text-caption">
            <FileImage className="size-3.5 text-muted" />
            <span className="font-medium text-primary">{t.chat.input.generationAutomatic}</span>
            <span className="ml-auto text-muted">{assets.length}/10</span>
          </div>
          <p className="mt-1 text-caption text-muted">{t.chat.input.generationAutoDescription}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {assets.map((asset) => (
              <div className="flex max-w-48 items-center gap-1 rounded-control border border-line-subtle bg-elevated px-2 py-1 text-caption text-muted" key={asset.id}>
                {asset.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="size-6 rounded object-cover" src={asset.previewUrl} />
                ) : null}
                <span className="min-w-0 flex-1 truncate" title={asset.file.name}>{asset.file.name}</span>
                <Button
                  aria-label={`${t.contentGeneration.removeFile} ${asset.file.name}`}
                  disabled={disabled}
                  htmlType="button"
                  icon={<X />}
                  onClick={() => onRemove(asset.id)}
                  shape="circle"
                  size="small"
                  type="text"
                />
              </div>
            ))}
          </div>
          {remaining ? (
            <label className="mt-2 flex h-8 cursor-pointer items-center justify-center rounded-control border border-dashed border-line-strong text-caption text-muted hover:bg-hover hover:text-primary">
              {t.contentGeneration.chooseFile}
              <input
                accept={slots.flatMap((slot) => slot.acceptedTypes ?? [`${slot.mediaType}/*`]).join(",")}
                className="hidden"
                disabled={disabled}
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []).slice(0, remaining);
                  for (const slot of slots) {
                    const matching = files.filter((file) => file.type.startsWith(`${slot.mediaType}/`));
                    if (matching.length) onAdd(slot, matching);
                  }
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-2 border-b border-line-subtle px-4 py-3 sm:grid-cols-2">
      {slots.map((slot) => {
        const selected = assets.filter((asset) => asset.slot === slot.key);
        const remaining = Math.max(0, (slot.maxFiles ?? 1) - selected.length);
        const Icon = slot.mediaType === "video" ? FileVideo : slot.mediaType === "audio" ? FileMusic : FileImage;
        return (
          <div className="rounded-control border border-line-subtle bg-subtle px-2.5 py-2" key={slot.key}>
            <div className="flex items-center gap-2 text-caption">
              <Icon className="size-3.5 text-muted" />
              <span className="font-medium text-primary">{slot.label}{slot.required ? " *" : ""}</span>
              <span className="ml-auto text-muted">{selected.length}/{slot.maxFiles ?? 1}</span>
            </div>
            {slot.description ? <p className="mt-1 text-caption text-muted">{slot.description}</p> : null}
            {selected.map((asset) => (
              <div className="mt-1 flex items-center gap-1 text-caption text-muted" key={asset.id}>
                {asset.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" className="size-6 rounded object-cover" src={asset.previewUrl} />
                ) : null}
                <span className="min-w-0 flex-1 truncate" title={asset.file.name}>{asset.file.name}</span>
                <Button
                  aria-label={`${t.contentGeneration.removeFile} ${asset.file.name}`}
                  disabled={disabled}
                  htmlType="button"
                  icon={<X />}
                  onClick={() => onRemove(asset.id)}
                  shape="circle"
                  size="small"
                  type="text"
                />
              </div>
            ))}
            {remaining ? (
              <label className="mt-1.5 flex h-7 cursor-pointer items-center justify-center rounded-control border border-dashed border-line-strong text-caption text-muted hover:bg-hover hover:text-primary">
                {t.contentGeneration.chooseFile}
                <input
                  accept={slot.acceptedTypes?.join(",") ?? `${slot.mediaType}/*`}
                  className="hidden"
                  disabled={disabled}
                  multiple={Boolean(slot.multiple)}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []).slice(0, remaining);
                    if (files.length) onAdd(slot, files);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
