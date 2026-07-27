import {
  DEFAULT_CONVERSATION_WIDTH,
  DEFAULT_INSPECTOR_WIDTH,
  DEFAULT_PRIMARY_NAV_WIDTH,
  type PanelWidths,
} from "./panel-sizing";

const STORAGE_KEY = "po.workspace.layout.v1";

export type WorkspaceLayoutPreferences = {
  conversationOpen: boolean;
  inspectorOpen: boolean;
  primaryNavExpanded: boolean;
  widths: PanelWidths;
};

export const DEFAULT_LAYOUT_PREFERENCES: WorkspaceLayoutPreferences = {
  conversationOpen: true,
  inspectorOpen: false,
  primaryNavExpanded: true,
  widths: {
    conversation: DEFAULT_CONVERSATION_WIDTH,
    inspector: DEFAULT_INSPECTOR_WIDTH,
    primaryNav: DEFAULT_PRIMARY_NAV_WIDTH,
  },
};

export function readLayoutPreferences(): WorkspaceLayoutPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT_PREFERENCES;
    const value = JSON.parse(raw) as Partial<WorkspaceLayoutPreferences>;
    return {
      conversationOpen:
        typeof value.conversationOpen === "boolean"
          ? value.conversationOpen
          : DEFAULT_LAYOUT_PREFERENCES.conversationOpen,
      inspectorOpen:
        typeof value.inspectorOpen === "boolean"
          ? value.inspectorOpen
          : DEFAULT_LAYOUT_PREFERENCES.inspectorOpen,
      primaryNavExpanded:
        typeof value.primaryNavExpanded === "boolean"
          ? value.primaryNavExpanded
          : DEFAULT_LAYOUT_PREFERENCES.primaryNavExpanded,
      widths: {
        conversation: finiteOrDefault(
          value.widths?.conversation,
          DEFAULT_CONVERSATION_WIDTH,
        ),
        inspector: finiteOrDefault(
          value.widths?.inspector,
          DEFAULT_INSPECTOR_WIDTH,
        ),
        primaryNav: finiteOrDefault(
          value.widths?.primaryNav,
          DEFAULT_PRIMARY_NAV_WIDTH,
        ),
      },
    };
  } catch {
    return DEFAULT_LAYOUT_PREFERENCES;
  }
}

export function writeLayoutPreferences(
  preferences: WorkspaceLayoutPreferences,
) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function finiteOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
