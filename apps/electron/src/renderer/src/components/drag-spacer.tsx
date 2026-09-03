/**
 * Compatibility spacer for pages that predate the shell-level titlebar.
 *
 * Window movement now comes from the shell-level content titlebar. The spacer
 * retains the older pages' 28px visual rhythm without creating a second drag
 * region or claiming pointer events over page controls.
 *
 */
export function DragSpacer(): React.JSX.Element {
  return <div aria-hidden="true" className="h-7 shrink-0" />;
}
