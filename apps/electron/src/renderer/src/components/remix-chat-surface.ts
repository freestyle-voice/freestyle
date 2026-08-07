/** Sizes for the Remix card. Kept separate so `app.tsx` can size the pill
 * window without importing the chat (and its animation deps). */
export const REMIX_CHAT_SURFACE = { width: 408, height: 560 } as const;

/** The card grows between these two inside room the window already holds, so
 * growing never resizes the window. */
export const REMIX_CHAT_MIN_HEIGHT = 132;
export const REMIX_CHAT_MAX_HEIGHT = REMIX_CHAT_SURFACE.height;

/** Resting strip size; grows when a settled run shows the final message. */
export const REMIX_CHAT_STRIP = { width: 320, height: 44 } as const;

export interface RemixChatAnchor {
  v: "top" | "bottom";
  h: "right" | "center";
}
