export const PANEL_TABS = [
  "chat",
  "history",
  "todos",
  "notes",
  "brain",
  "apps",
] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

// Retained for the modern workspace module while the legacy dashboard shell
// becomes the default desktop surface.
export const PANEL_WIDTH = 397;
export const PANEL_MIN_WIDTH = 340;
export const PANEL_MAX_WIDTH = 760;
export const PANEL_HEIGHT = 624;
export const PANEL_GAP = 10;
export const COMPANION_CLEARANCE = 84;
