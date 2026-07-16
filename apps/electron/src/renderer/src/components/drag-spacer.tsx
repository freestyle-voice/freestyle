/**
 * Draggable titlebar spacer at the top of each page.
 *
 * This is the **only** drag region for window-move on macOS — the page
 * wrapper must NOT set `WebkitAppRegion: "drag"` itself, otherwise the
 * drag region covers the entire page and swallows pointer events from
 * the absolutely-positioned topbar buttons (GitHub / Discord) in the
 * top-right corner, even when they have `no-drag` and higher z-index.
 *
 * The right side is kept clear (`mr-[72px]`) so those buttons remain
 * fully clickable.
 */
export function DragSpacer(): React.JSX.Element {
  return (
    <div
      className="mr-[72px] h-7 shrink-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    />
  );
}
