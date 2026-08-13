import { z } from "zod/v3";

/**
 * Remix: the AI writing agent on the cursor. Two lanes share these contracts:
 *
 * - Transform (fast lane): preset or short spoken instruction over a captured
 *   selection, one-shot LLM call, result pasted over the selection.
 * - Agent (chat lane): a tool-using agent loop. Server-side tools run on
 *   Freestyle Cloud; client-side tools (declared here, executed on the
 *   desktop) write into the user's document.
 *
 * This file is mirrored byte-for-byte (below the header) into the cloud
 * repo's `packages/validations/src/remix.ts` — the same parity rule as
 * `cleanup-presets.ts`. Change both or change neither.
 */

export interface RemixPreset {
  id: string;
  /** Shown in the pill's route strip. Keep it to one word where possible. */
  label: string;
  /**
   * What the model is told to do. Written as an instruction to an editor
   * working on someone else's text, because that's exactly what it is — the
   * selection is quoted content, never a prompt.
   */
  instruction: string;
}

/**
 * The routes, in the order they are drawn. Three, on one row: the edits
 * people ask for without thinking. A fourth would start a second row and turn
 * a glanceable strip into a list to be read.
 */
export const REMIX_PRESETS: readonly RemixPreset[] = [
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

export function findRemixPreset(id: string): RemixPreset | undefined {
  return REMIX_PRESETS.find((preset) => preset.id === id);
}

/**
 * A transform run. Exactly one of `remixId` (a preset) or `instruction` (what
 * the user said) identifies the edit; the route rejects a body carrying
 * neither, since "edit this somehow" isn't an edit.
 */
export const remixTransformSchema = z
  .object({
    // Non-blank, but the caller's whitespace is preserved verbatim — the
    // selection is pasted back over itself, so leading/trailing space is part
    // of what the user picked.
    text: z
      .string()
      .max(100_000)
      .refine((v) => v.trim().length > 0, "text field is required"),
    remixId: z.string().optional(),
    instruction: z.string().max(4_000).optional(),
    language: z.string().max(50).optional(),
    appName: z.string().max(200).nullish(),
  })
  .refine(
    (v) => !!v.remixId || !!v.instruction?.trim(),
    "either remixId or instruction is required",
  );

export type RemixTransformInput = z.infer<typeof remixTransformSchema>;

// ---------------------------------------------------------------------------
// Agent lane
// ---------------------------------------------------------------------------

/** Everything the desktop captured about where the user is writing. */
export const remixContextSchema = z.object({
  /** The highlighted text, verbatim. Null when nothing was selected. */
  selection: z.string().max(100_000).nullable(),
  appName: z.string().max(200).nullable(),
  windowTitle: z.string().max(500).nullable(),
  /** ISO codes of the user's languages; the agent must not translate. */
  languages: z.array(z.string().max(50)).max(10).optional(),
  /** Preview of the user's clipboard text and its full length — "edit this"
   * with nothing highlighted usually means the clipboard. */
  clipboard: z.string().max(500).nullable().optional(),
  clipboardLength: z.number().int().optional(),
  /** Epoch ms of capture — lets the agent reason about staleness. */
  capturedAt: z.number(),
});

export type RemixContext = z.infer<typeof remixContextSchema>;

/**
 * One agent request. The server is stateless: `messages` is the full
 * UIMessage thread and IS the conversation state. UIMessage's shape belongs
 * to the AI SDK — validating it structurally here would chase SDK versions,
 * so the array passes through and `convertToModelMessages` is the validator.
 */
export const remixAgentRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(80),
  context: remixContextSchema,
});

export type RemixAgentRequest = z.infer<typeof remixAgentRequestSchema>;

/** Caps re-checked by the desktop before anything touches the document. */
export const REMIX_WRITE_LIMIT = 20_000;
export const REMIX_CLIPBOARD_LIMIT = 100_000;

/**
 * Client-side tools: deliberately primitive. Each is one dumb action against
 * the user's machine — no composites, no verification, no caching. The
 * WORKFLOW lives in the system prompt; the descriptions below are the
 * per-tool contract: what it does, what it returns, and how to recover when
 * it fails. Edge cases are handled by tweaking prompt + descriptions, not by
 * adding machinery here.
 *
 * The names are the wire contract — the cloud route, the local BYOK loop,
 * and the renderer's tool executor all switch on them.
 */
export const REMIX_CLIENT_TOOLS = {
  get_context: {
    description:
      "Look at the user's machine right now. Returns { ok, appName, windowTitle, url, selection, preciseSelection, docLength }: appName/windowTitle describe the frontmost app, url is the active browser tab (null unless the app is a browser), selection is the text currently highlighted (null when nothing is highlighted), preciseSelection tells you whether select_text works in this app (false = canvas editor: use the select_all whole-document recipes instead), docLength is the document's character count when the app exposes it, and clipboardPreview/clipboardLength show what's on the user's clipboard (a capped preview — get_clipboard returns the full text). Call this once at the start of any task that depends on what is highlighted or where the user is writing, and trust it over the summon-time snapshot in your context. Reading the highlight injects a Copy keystroke into the document, so do not call it repeatedly — again only after the user may have changed something. Failure: { ok: false, reason: 'document-not-in-front' } means the user's document is no longer the frontmost app — stop and ask them to click back into it.",
    inputSchema: z.object({}),
  },
  select_all: {
    description:
      "Select the entire document (one Cmd/Ctrl+A) in the user's frontmost app. Returns { ok }. After this, copy reads the whole document and paste replaces the whole document. WARNING: this DESTROYS the user's highlight — never use it when the highlight is the edit target (use read_document to see the document without touching the highlight). NEVER end your turn with the document in this state — always follow with either a paste, or copy + collapse_selection. Failures: 'document-not-in-front' (ask the user to click back into their document), 'inject-failed' (the keystroke was blocked; tell the user to check Accessibility permissions).",
    inputSchema: z.object({}),
  },
  select_text: {
    description:
      "Select an exact text span in the document, visibly moving the user's cursor onto it — after which paste replaces exactly that span. Returns { ok }. Only works in apps where get_context reported preciseSelection: true. Failures: 'unsupported' (canvas editor — use the select_all whole-document recipe instead), 'not-found' (your span does not match the document character-for-character — re-read and take the passage verbatim), 'ambiguous' with matches: N (the span appears N times — either extend it with surrounding words until unique, or pass occurrence to pick one), 'document-not-in-front'.",
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(REMIX_WRITE_LIMIT)
        .describe(
          "The exact span to select, copied character-for-character from a copy of the document — including whitespace and punctuation. This is not a search query: no regex, no paraphrasing, no ellipses.",
        ),
      occurrence: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe(
          "When the span appears more than once: which occurrence to select, counting from 1 at the top of the document. Omit when the span is unique.",
        ),
    }),
  },
  read_document: {
    description:
      "Read the ENTIRE document via the accessibility API — zero keystrokes, and the user's highlight stays exactly where it is. Returns { ok, text, truncated, selStart, selLen } (selStart/selLen locate the current selection within the text). This is how you get surrounding context for a highlighted edit without destroying the highlight. Only works where get_context reported preciseSelection: true; canvas editors return 'unsupported' — there, either work from the highlight alone or accept that select_all reading forces a whole-document rewrite.",
    inputSchema: z.object({}),
  },
  collapse_selection: {
    description:
      "Collapse the current selection with one Right-Arrow press: the cursor lands just after what was selected and nothing is selected anymore. Returns { ok }. Use immediately after reading with select_all + copy, so a stray keystroke can't wipe the document.",
    inputSchema: z.object({}),
  },
  copy: {
    description:
      "Copy the current selection (Cmd/Ctrl+C) and return it to you. Returns { ok, text, truncated } — text is the selection's plain text (capped at 60,000 chars; truncated: true past that). The user's own clipboard is restored afterwards: the text comes back in this result, it does NOT stay on the clipboard, so pasting it later still requires set_clipboard first. Failure: 'nothing-copied' means nothing was selected or the app was too slow to answer — after a select_all on a large document, try once more before giving up.",
    inputSchema: z.object({}),
  },
  set_clipboard: {
    description:
      "Put text on the user's clipboard (really — it replaces what they had). Returns { ok }. Almost always followed by paste in the same turn — Remix's job is writing into the user's document. Use it WITHOUT paste only when the user explicitly asked for clipboard-only ('copy it', 'don't paste') — then tell them it's on their clipboard.",
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .max(REMIX_CLIPBOARD_LIMIT)
        .describe(
          "The final text exactly as it should appear if pasted: no preamble, no commentary, no wrapping quotes, no code fence unless the original had one. When replacing document text, reproduce every unchanged character exactly as you read it.",
        ),
    }),
  },
  set_clipboard_image: {
    description:
      "Download an image onto the user's clipboard. Returns { ok }. Follow with paste to insert it into the document. Failure: 'fetch-failed' (the URL didn't serve a usable image — try the next image_search result; if none work, give the user the URL in chat instead).",
    inputSchema: z.object({
      url: z
        .string()
        .url()
        .max(2_000)
        .describe(
          "A direct image-file URL — use imageUrl from image_search results, NOT sourceUrl (which is the webpage the image came from).",
        ),
    }),
  },
  paste: {
    description:
      "Inject Cmd/Ctrl+V: whatever is on the clipboard RIGHT NOW lands in the document at the cursor, replacing the current selection if there is one. Returns { ok }. Paste takes no text argument — you must call set_clipboard or set_clipboard_image first in the same turn, or you will paste stale clipboard contents. ok: true means the keystroke was delivered, not that the result looks right: for edits that matter, verify per your VERIFY recipe before telling the user it's done. Failures: 'document-not-in-front' (ask the user to click back into their document), 'paste-failed'.",
    inputSchema: z.object({}),
  },
  undo: {
    description:
      "The app's own Undo (Cmd/Ctrl+Z). Returns { ok }. Reverses the last edit natively — including formatting that a plain-text re-paste can't restore, which makes it the best way to revert your own paste. Use it only immediately after your own edit and at most once per edit, then verify with a read-back: undoing further starts eating the user's own work.",
    inputSchema: z.object({}),
  },
  redo: {
    description:
      "The app's own Redo (Cmd/Ctrl+Shift+Z) — reverses an undo. Returns { ok }.",
    inputSchema: z.object({}),
  },
  press_key: {
    description:
      "Press one bare key in the document (no modifier chords exist — compose bigger actions from the other tools). Returns { ok }. Common uses: backspace deletes the current selection; enter inserts a line break between pastes; tab moves to the next field; escape dismisses a popup; arrows nudge the cursor one step.",
    inputSchema: z.object({
      key: z
        .enum([
          "enter",
          "tab",
          "escape",
          "backspace",
          "delete",
          "left",
          "right",
          "up",
          "down",
          "home",
          "end",
        ])
        .describe(
          "The key to press, exactly one of the listed names. 'backspace' deletes backward/deletes the selection; 'delete' deletes forward.",
        ),
      times: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe(
          "Press the key this many times in a row (default 1). Use for multi-step cursor movement instead of repeated calls.",
        ),
    }),
  },
  get_clipboard: {
    description:
      "Read the full text currently on the user's clipboard. Returns { ok, text, truncated }. The context snapshot and get_context already show a capped preview — call this when the clipboard is the subject of the task and you need all of it. When nothing is highlighted and the user says 'edit this' / 'fix it' with no visible target, what they copied is usually what they mean.",
    inputSchema: z.object({}),
  },
} as const;

export type RemixClientToolName = keyof typeof REMIX_CLIENT_TOOLS;

export const REMIX_CLIENT_TOOL_NAMES = Object.keys(
  REMIX_CLIENT_TOOLS,
) as RemixClientToolName[];

export function isRemixClientTool(name: string): name is RemixClientToolName {
  return name in REMIX_CLIENT_TOOLS;
}
