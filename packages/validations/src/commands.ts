import { z } from "zod/v3";

/**
 * Commands: run an AI edit over whatever text the user has selected in any
 * app, in place. The hotkey grabs the selection, you say what to change, and
 * the result is pasted back over it.
 *
 * Saying it is the whole interaction. The routes below exist only because a
 * handful of edits are asked for often enough that speaking them every time is
 * a tax — they are a shortcut past the microphone, not a menu the feature is
 * built around, which is why there are three of them and not a screenful.
 *
 * They live here rather than on the server because both halves need them for
 * different reasons: the server turns an id into an instruction for the model,
 * and the pill draws the label. One list means the card can never offer a
 * route the server doesn't know how to run.
 */

export interface CommandPreset {
  id: string;
  /** Shown in the pill's route strip. Keep it to one word where possible. */
  label: string;
  /**
   * What the model is told to do. Written as an instruction to an editor
   * working on someone else's text, because that's exactly what it is — the
   * selection is quoted content, never a prompt (see the route's system
   * prompt, which is what actually enforces that).
   */
  instruction: string;
}

/**
 * The routes, in the order they are drawn.
 *
 * Three, on one row, chosen because they are the edits people ask for without
 * thinking. A fourth would start a second row and turn a glanceable strip into
 * a list to be read — at which point saying what you want is faster than
 * scanning for it, and the route has stopped earning its place.
 */
export const COMMAND_PRESETS: readonly CommandPreset[] = [
  {
    id: "fix",
    label: "Fix",
    instruction:
      "Correct grammar, spelling, and punctuation errors. Preserve the author's wording, voice, structure, and level of formality exactly — change only what is actually wrong. If the text contains no errors, return it unchanged.",
  },
  {
    id: "formal",
    label: "Formal",
    instruction:
      "Rewrite the text in a professional register suitable for work correspondence: complete sentences, no slang, measured tone, nothing curt. Keep the meaning, the substance, and the author's actual position identical — this is a change of register, not of content.",
  },
  {
    id: "markdown",
    label: "Markdown",
    instruction:
      "Format the text as Markdown, using the structure the text already has: headings for what reads as a heading, `-` bullets or numbered items for what reads as a list, `**bold**` for what is emphasised, and backticks for code, paths, and commands. Keep the wording as it is — this is formatting, not rewriting. Do not wrap the whole result in a code fence.",
  },
] as const;

export function findCommandPreset(id: string): CommandPreset | undefined {
  return COMMAND_PRESETS.find((preset) => preset.id === id);
}

/**
 * A command run. Exactly one of `commandId` (a preset) or `instruction` (what
 * the user said) identifies the edit; the route rejects a body carrying
 * neither, since "edit this somehow" isn't a command.
 */
export const commandSchema = z
  .object({
    // Non-blank, but the caller's whitespace is preserved verbatim — the
    // selection is pasted back over itself, so leading/trailing space is part
    // of what the user picked.
    text: z
      .string()
      .refine((v) => v.trim().length > 0, "text field is required"),
    commandId: z.string().optional(),
    instruction: z.string().optional(),
    language: z.string().optional(),
  })
  .refine(
    (v) => !!v.commandId || !!v.instruction?.trim(),
    "either commandId or instruction is required",
  );

export type CommandInput = z.infer<typeof commandSchema>;
