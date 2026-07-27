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
