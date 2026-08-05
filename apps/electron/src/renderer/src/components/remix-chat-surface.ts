/** Sizes for the Remix card. Kept separate so `app.tsx` can size the pill
 * window without importing the chat (and its animation deps). */
export const REMIX_CHAT_SURFACE = { width: 408, height: 560 } as const;

/** Resting strip size; grows when a settled run shows the final message. */
export const REMIX_CHAT_STRIP = { width: 320, height: 44 } as const;

export interface RemixChatAnchor {
  v: "top" | "bottom";
  h: "right" | "center";
}
