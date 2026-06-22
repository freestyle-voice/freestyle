import type { TextTransformInput } from "./hooks.js";

/**
 * A pure-ish text transformer: given the current text (and context), return the
 * next text. Returning the same string is a no-op.
 */
export type TextTransformer = (
  text: string,
  input: TextTransformInput,
) => string | Promise<string>;

/**
 * Ergonomic helper for the most common plugin: a single text rewrite. Wraps a
 * pure `(text) => text` function into the `text.transform` hook shape so
 * authors don't deal with the `(input, output)` mutation convention.
 *
 * @example
 * ```ts
 * import { transform, type Plugin } from "@freestyle/sdk";
 *
 * const trimTrailing = transform((text) => text.replace(/\s+$/, ""));
 *
 * export const TrimPlugin: Plugin = async () => ({
 *   "text.transform": trimTrailing,
 * });
 * ```
 */
export function transform(fn: TextTransformer) {
  return async (
    input: TextTransformInput,
    output: { text: string },
  ): Promise<void> => {
    output.text = await fn(output.text, input);
  };
}
