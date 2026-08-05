/**
 * The Remix card's two shapes, and where it hangs off the pill.
 *
 * These live apart from the component on purpose. `app.tsx` needs the sizes on
 * every render — they drive the pill window's own geometry — while the chat
 * itself is loaded only when Remix is actually opened. Keeping the constants in
 * their own module lets the component (and the ~385kB of animation code it
 * pulls in) stay out of the chunk that has to parse before the first dictation
 * waveform frame.
 */

export const REMIX_CHAT_SURFACE = { width: 408, height: 560 } as const;

/**
 * The strip's resting size. It grows from here: once a run settles the strip
 * shows the agent's final message in full, and the host surface follows the
 * height RemixChat reports.
 */
export const REMIX_CHAT_STRIP = { width: 320, height: 44 } as const;

export interface RemixChatAnchor {
  v: "top" | "bottom";
  h: "right" | "center";
}
