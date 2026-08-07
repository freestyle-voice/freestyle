/** Sizes for the Remix card. Kept separate so `app.tsx` can size the pill
 * window without importing the chat (and its animation deps). */
export const REMIX_CHAT_SURFACE = { width: 408, height: 560 } as const;

/** The card grows with its content between these two. 560 stays the room the
 * window reserves, so growing never has to resize the window — the card just
 * occupies more of a space that is already there. */
export const REMIX_CHAT_MIN_HEIGHT = 132;
export const REMIX_CHAT_MAX_HEIGHT = REMIX_CHAT_SURFACE.height;

/** Resting strip size; grows when a settled run shows the final message. */
export const REMIX_CHAT_STRIP = { width: 320, height: 44 } as const;

export interface RemixChatAnchor {
  v: "top" | "bottom";
  h: "right" | "center";
}
