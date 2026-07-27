export type ConversationNavigatorAnchor = {
  id: string;
  top: number;
};

export function selectActiveConversationEntry({
  anchors,
  atLatest,
  referenceTop,
}: {
  anchors: ConversationNavigatorAnchor[];
  atLatest: boolean;
  referenceTop: number;
}) {
  if (anchors.length === 0) return null;
  if (atLatest) return anchors.at(-1)?.id ?? null;

  let activeId = anchors[0]?.id ?? null;
  for (const anchor of anchors) {
    if (anchor.top > referenceTop) break;
    activeId = anchor.id;
  }
  return activeId;
}

const WAVE_WIDTHS = [30, 23, 17, 12, 8] as const;

export function waveLineWidth({
  active,
  hoveredIndex,
  index,
}: {
  active: boolean;
  hoveredIndex: number;
  index: number;
}) {
  if (hoveredIndex < 0) return active ? 18 : 7;
  const waveWidth = WAVE_WIDTHS[Math.abs(index - hoveredIndex)] ?? 7;
  return active ? Math.max(18, waveWidth) : waveWidth;
}
