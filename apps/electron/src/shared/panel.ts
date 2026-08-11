export const PANEL_TABS = ["chat", "history", "todos", "notes"] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

// 380px of bubble + 7px of hard shadow.
export const PANEL_WIDTH = 387;
export const PANEL_HEIGHT = 624;
export const PANEL_GAP = 10;
export const COMPANION_CLEARANCE = 84;
