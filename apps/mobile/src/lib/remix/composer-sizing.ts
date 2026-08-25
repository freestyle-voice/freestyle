/** The native composer grows naturally from one line through four, then its
 * own TextInput scrolls without pushing the keyboard or transcript around. */
export const REMIX_COMPOSER_MIN_INPUT_HEIGHT = 42;
export const REMIX_COMPOSER_MAX_INPUT_HEIGHT = 104;

export function remixComposerInputHeight(contentHeight: number): number {
  if (!Number.isFinite(contentHeight)) return REMIX_COMPOSER_MIN_INPUT_HEIGHT;
  return Math.min(
    REMIX_COMPOSER_MAX_INPUT_HEIGHT,
    Math.max(REMIX_COMPOSER_MIN_INPUT_HEIGHT, Math.ceil(contentHeight)),
  );
}
