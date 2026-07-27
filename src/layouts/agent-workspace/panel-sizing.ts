export const COLLAPSED_PRIMARY_NAV_WIDTH = 56;
export const INSPECTOR_DOCK_WIDTH = 44;
export const DEFAULT_PRIMARY_NAV_WIDTH = 216;
export const DEFAULT_CONVERSATION_WIDTH = 248;
export const DEFAULT_INSPECTOR_WIDTH = 420;
export const MIN_PRIMARY_NAV_WIDTH = 184;
export const MAX_PRIMARY_NAV_WIDTH = 300;
export const MIN_CONVERSATION_WIDTH = 216;
export const MAX_CONVERSATION_WIDTH = 360;
export const MIN_INSPECTOR_WIDTH = 320;
export const MAX_INSPECTOR_WIDTH = 720;
export const MIN_CHAT_WIDTH = 570;
export const NARROW_WORKSPACE_WIDTH = 1280;
export const COMPACT_PRIMARY_NAV_WORKSPACE_WIDTH = 1440;

const RESIZE_HANDLE_WIDTH = 1;
const WORKSPACE_CHROME_WIDTH = 56;

export type PanelWidths = {
  conversation: number;
  inspector: number;
  primaryNav: number;
};

export type PanelVisibility = {
  conversationOpen: boolean;
  inspectorOpen: boolean;
  primaryNavExpanded: boolean;
  showInspectorDock: boolean;
};

export type WidthBounds = {
  max: number;
  min: number;
};

function clamp(value: number, { max, min }: WidthBounds) {
  return Math.min(max, Math.max(min, value));
}

export function isNarrowWorkspace(containerWidth: number) {
  return containerWidth < NARROW_WORKSPACE_WIDTH;
}

export function getEffectivePrimaryNavWidth(
  containerWidth: number,
  expanded: boolean,
  width: number,
) {
  return expanded && !isNarrowWorkspace(containerWidth)
    && containerWidth >= COMPACT_PRIMARY_NAV_WORKSPACE_WIDTH
      ? width
      : COLLAPSED_PRIMARY_NAV_WIDTH;
}

export function getPrimaryNavWidthBounds(): WidthBounds {
  return {
    max: MAX_PRIMARY_NAV_WIDTH,
    min: MIN_PRIMARY_NAV_WIDTH,
  };
}

export function getConversationWidthBounds(
  containerWidth: number,
  primaryNavWidth: number,
  inspectorWidth: number,
  inspectorOpen: boolean,
  showInspectorDock: boolean,
): WidthBounds {
  const inspectorConsumesSpace =
    inspectorOpen && !isNarrowWorkspace(containerWidth);
  const reserved =
    primaryNavWidth +
    (inspectorConsumesSpace ? inspectorWidth : 0) +
    (showInspectorDock ? INSPECTOR_DOCK_WIDTH : 0) +
    MIN_CHAT_WIDTH +
    WORKSPACE_CHROME_WIDTH +
    3 * RESIZE_HANDLE_WIDTH;
  const max = Math.min(
    MAX_CONVERSATION_WIDTH,
    Math.max(0, containerWidth - reserved),
  );
  return {
    max,
    min: Math.min(MIN_CONVERSATION_WIDTH, max),
  };
}

export function getInspectorWidthBounds(
  containerWidth: number,
  primaryNavWidth: number,
  conversationWidth: number,
  conversationOpen: boolean,
  showInspectorDock: boolean,
): WidthBounds {
  if (isNarrowWorkspace(containerWidth)) {
    const max = Math.min(MAX_INSPECTOR_WIDTH, containerWidth * 0.6);
    return {
      max,
      min: Math.min(MIN_INSPECTOR_WIDTH, max),
    };
  }

  const reserved =
    primaryNavWidth +
    (conversationOpen ? conversationWidth : 0) +
    (showInspectorDock ? INSPECTOR_DOCK_WIDTH : 0) +
    MIN_CHAT_WIDTH +
    WORKSPACE_CHROME_WIDTH +
    3 * RESIZE_HANDLE_WIDTH;
  const max = Math.min(
    MAX_INSPECTOR_WIDTH,
    Math.max(0, containerWidth - reserved),
  );
  return {
    max,
    min: Math.min(MIN_INSPECTOR_WIDTH, max),
  };
}

export function fitPanelWidths(
  containerWidth: number,
  widths: PanelWidths,
  visibility: PanelVisibility,
): PanelWidths {
  const primaryNav = clamp(widths.primaryNav, getPrimaryNavWidthBounds());
  const effectivePrimaryNav = getEffectivePrimaryNavWidth(
    containerWidth,
    visibility.primaryNavExpanded,
    primaryNav,
  );
  let conversation = clamp(widths.conversation, {
    max: MAX_CONVERSATION_WIDTH,
    min: MIN_CONVERSATION_WIDTH,
  });
  let inspector = clamp(widths.inspector, {
    max: Math.min(MAX_INSPECTOR_WIDTH, containerWidth * 0.6),
    min: Math.min(MIN_INSPECTOR_WIDTH, containerWidth * 0.6),
  });

  if (isNarrowWorkspace(containerWidth)) {
    return { conversation, inspector, primaryNav };
  }

  const visibleHandleCount =
    Number(visibility.primaryNavExpanded) +
    Number(visibility.conversationOpen) +
    Number(visibility.inspectorOpen);
  const occupied =
    effectivePrimaryNav +
    (visibility.conversationOpen ? conversation : 0) +
    (visibility.inspectorOpen ? inspector : 0) +
    (visibility.showInspectorDock ? INSPECTOR_DOCK_WIDTH : 0) +
    WORKSPACE_CHROME_WIDTH +
    visibleHandleCount * RESIZE_HANDLE_WIDTH;
  let overflow = occupied + MIN_CHAT_WIDTH - containerWidth;

  if (overflow > 0 && visibility.inspectorOpen) {
    const reduction = Math.min(
      overflow,
      Math.max(0, inspector - MIN_INSPECTOR_WIDTH),
    );
    inspector -= reduction;
    overflow -= reduction;
  }
  if (overflow > 0 && visibility.conversationOpen) {
    const reduction = Math.min(
      overflow,
      Math.max(0, conversation - MIN_CONVERSATION_WIDTH),
    );
    conversation -= reduction;
  }

  return { conversation, inspector, primaryNav };
}
