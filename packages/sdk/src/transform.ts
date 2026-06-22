import type { Handler, TextTransformInput } from "./hooks.js";

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
 * export default function trim(): Plugin {
 *   return {
 *     name: "freestyle-plugin-trim",
 *     "text.transform": transform((text) => text.replace(/\s+$/, "")),
 *   };
 * }
 * ```
 */
export function transform(
  fn: TextTransformer,
): Handler<TextTransformInput, { text: string }> {
  return async (input, output) => {
    output.text = await fn(output.text, input);
  };
}
