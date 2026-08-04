import {
  Image as ImageIcon,
  Link2,
  Paperclip,
  Smile,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// EmailDraft — a Gmail-faithful compose-window mockup used as onboarding's
// practice surface. Deliberately exempt from the design system INSIDE its
// frame (white surface, Gmail blue, Roboto-ish stack): it reads as a
// depiction of another app, like a screenshot. Everything outside stays ours.
//
// The body is an UNCONTROLLED contenteditable: dictation and the Remix agent
// mutate it through real OS-level pastes (including inline images), so React
// never writes it back after the one-time hydration — `onInput` only syncs
// the text out for gating/analytics.
// ---------------------------------------------------------------------------

const GMAIL_FONT = "'Google Sans', Roboto, 'Helvetica Neue', Arial, sans-serif";

export interface EmailDraftProps {
  body: string;
  onBodyChange: (text: string) => void;
  stage: "dictate" | "remix";
  /** Non-null switches the body to a read-only, script-driven surface
   * (the no-LLM fallback's automated remix preview). */
  scriptedBody?: string | null;
  /** Keep the whole body selected — the remix step's mode. The hotkey's
   * selection capture then copies the highlighted text and the agent's
   * paste replaces it in place. */
  highlightBody?: boolean;
  /** Bump to re-highlight after an external mutation (a remix delivery). */
  highlightSignal?: number;
}

export function EmailDraft({
  body,
  onBodyChange,
  stage,
  scriptedBody = null,
  highlightBody = false,
  highlightSignal = 0,
}: EmailDraftProps): React.JSX.Element {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);
  const scripted = scriptedBody !== null;

  const selectBody = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  // Hydrate once on mount — the lifted body survives the draft→remix step
  // transition; after this the DOM owns the content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only hydration
  useEffect(() => {
    const el = bodyRef.current;
    if (el && body && !el.innerText.trim()) el.innerText = body;
    if (scripted) return;
    if (highlightBody) selectBody();
    else if (stage === "dictate") el?.focus();
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && scriptedBody !== null) el.innerText = scriptedBody;
  }, [scriptedBody]);

  // Keep the draft highlighted: on entering highlight mode and after each
  // delivery (delayed so the injected paste has landed first), so the next
  // remix pass edits the whole current text again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: highlightSignal exists purely to re-run this effect on each delivery
  useEffect(() => {
    if (!highlightBody || scripted) return;
    const timeout = window.setTimeout(selectBody, 350);
    return () => window.clearTimeout(timeout);
  }, [highlightBody, highlightSignal, scripted, selectBody]);

  // When the window regains focus mid-remix (e.g. after the pill's chat card
  // is dismissed), the agent's injected keystrokes must land in the draft —
  // same reason main blurs the pill before injecting.
  useEffect(() => {
    if (scripted) return;
    const refocus = (): void => {
      if (highlightBody) selectBody();
      else bodyRef.current?.focus();
    };
    window.addEventListener("focus", refocus);
    return () => window.removeEventListener("focus", refocus);
  }, [scripted, highlightBody, selectBody]);

  return (
    <div
      className="w-full max-w-[560px] overflow-hidden rounded-[10px] bg-white text-left shadow-[0_10px_34px_rgba(20,12,4,0.28)]"
      style={{ fontFamily: GMAIL_FONT }}
    >
      <div className="flex items-center justify-between bg-[#404346] px-4 py-2.5">
        <span className="text-[14px] font-medium text-white">
          {t("onboarding.draft.newMessage")}
        </span>
        <span
          aria-hidden="true"
          className="flex items-center gap-3 text-[13px] leading-none text-[#c3c6c9]"
        >
          <span>–</span>
          <span className="text-[11px]">⤢</span>
          <span>✕</span>
        </span>
      </div>

      <div className="flex min-h-[40px] items-center gap-2 border-b border-[#e8eaed] px-4 py-1.5 text-[13px]">
        <span className="text-[#5f6368]">{t("onboarding.draft.toLabel")}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] py-0.5 pr-2.5 pl-1">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0b57d0] text-[11px] font-medium text-white">
            {t("onboarding.draft.recipientName").charAt(0)}
          </span>
          <span
            className="text-[#1f1f1f]"
            title={t("onboarding.draft.recipientEmail")}
          >
            {t("onboarding.draft.recipientName")}
          </span>
        </span>
      </div>

      <div className="flex min-h-[36px] items-center border-b border-[#e8eaed] px-4 py-1.5 text-[13px] text-[#1f1f1f]">
        {t("onboarding.draft.subject")}
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: a textarea silently drops image pastes; the third beat lands an inline photo, and real Gmail compose is contenteditable too. */}
      <div
        ref={bodyRef}
        contentEditable={!scripted}
        suppressContentEditableWarning
        tabIndex={scripted ? -1 : 0}
        role="textbox"
        aria-multiline="true"
        aria-label={t("onboarding.draft.bodyAria")}
        onInput={(e) => onBodyChange(e.currentTarget.innerText)}
        className="min-h-[190px] cursor-text px-4 py-3 text-[14px] leading-[1.5] break-words whitespace-pre-wrap text-[#1f1f1f] outline-none [&_img]:my-1 [&_img]:h-auto [&_img]:max-w-full"
      />

      {/* Decorative footer — the mockup is a stage prop; onboarding finishes
          from its own button, not from a fake Send. */}
      <div
        aria-hidden="true"
        className="flex items-center gap-3 px-4 pt-1 pb-3.5"
      >
        <span className="flex h-9 cursor-default items-center rounded-full bg-[#0b57d0] px-6 text-[14px] font-medium text-white">
          {t("onboarding.draft.send")}
        </span>
        <span className="flex items-center gap-3 text-[#5f6368]">
          <Paperclip className="h-4 w-4" />
          <Link2 className="h-4 w-4" />
          <Smile className="h-4 w-4" />
          <ImageIcon className="h-4 w-4" />
        </span>
        <span className="ml-auto text-[#5f6368]">
          <Trash2 className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
