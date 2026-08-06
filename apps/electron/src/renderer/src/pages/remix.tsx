import { KNOWN_NOTIFICATION_KEYS } from "@freestyle-voice/validations";
import { DragSpacer } from "@renderer/components/drag-spacer";
import { KeyComboDisplay } from "@renderer/components/key-combo";
import {
  Keycap,
  StepWord,
  Wave,
} from "@renderer/components/onboarding/coach-strip";
import { useDismissible } from "@renderer/hooks/use-dismissible";
import { formatAcceleratorKeys } from "@renderer/hooks/use-hotkey-recorder";
import { getClient } from "@renderer/lib/api";
import { queryKeys, settingsQueryOptions } from "@renderer/lib/query";
import { cn } from "@renderer/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  MessageSquareText,
  Settings,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { getDefaultRemixHotkey } from "../../../shared/remix";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";

interface ThreadSummary {
  id: number;
  createdAt: string;
  lastActiveAt: string;
  preview: string;
  messageCount: number;
}

interface TranscriptPart {
  type?: string;
  text?: string;
}

interface TranscriptMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: TranscriptPart[];
}

// SQLite datetime('now') is UTC without a zone marker.
function parseSqliteDate(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

const EXAMPLE_GROUPS = [
  {
    id: "everyday",
    web: false,
    quotes: ["email", "tone", "social", "format", "translate"],
  },
  {
    id: "work",
    web: false,
    quotes: ["mla", "legal", "commit", "notes"],
  },
  {
    id: "web",
    web: true,
    quotes: ["medical", "espresso"],
  },
] as const;

export default function RemixPage(): React.JSX.Element {
  const { t } = useTranslation();

  const { data: settings } = useQuery(settingsQueryOptions());
  const remixHotkey =
    settings?.[SETTINGS_KEYS.remixHotkey] ||
    window.api?.defaultRemixHotkey ||
    getDefaultRemixHotkey();

  const {
    dismissed: heroDismissed,
    dismiss: dismissHero,
    ready: heroReady,
  } = useDismissible(KNOWN_NOTIFICATION_KEYS.REMIX_TUTORIAL_HERO);

  // View state: the guide ("home") or the conversation-history browser. A
  // selected thread id opens its transcript within the history view.
  const [showHistory, setShowHistory] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DragSpacer />
      <div
        className="responsive-page-scroll min-h-0 flex-1 overflow-auto px-8 pt-5"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        <div className="mx-auto w-full max-w-[760px]">
          {/* Header: page title + history / settings actions. */}
          <div className="border-border/60 mb-6 flex items-center justify-between gap-3 border-b pb-4">
            <h1 className="serif text-foreground m-0 text-[26px] font-medium leading-none">
              {showHistory
                ? t("remixPage.history.title")
                : t("remixPage.title")}
            </h1>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedThreadId(null);
                  setShowHistory((open) => !open);
                }}
                aria-pressed={showHistory}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  showHistory
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-card hover:text-foreground",
                )}
              >
                {showHistory ? (
                  <ArrowLeft className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                {showHistory
                  ? t("remixPage.history.exit")
                  : t("remixPage.history.button")}
              </button>
              <Link
                to="/settings#remix"
                className="text-muted-foreground hover:bg-card hover:text-foreground inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                {t("remixPage.settings.button")}
              </Link>
            </div>
          </div>

          {showHistory ? (
            selectedThreadId === null ? (
              <HistoryList onOpen={setSelectedThreadId} />
            ) : (
              <ThreadTranscript
                threadId={selectedThreadId}
                onBack={() => setSelectedThreadId(null)}
              />
            )
          ) : (
            <>
              {/* Demo hero — same UI as the Transcriptions tab's tutorial */}
              {heroReady && !heroDismissed && (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={dismissHero}
                      aria-label={t("remixPage.dismiss")}
                      title={t("remixPage.dismiss")}
                      className="text-muted-foreground hover:bg-card hover:text-foreground absolute top-3 right-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <RemixDemo hotkey={remixHotkey} />
                  </div>
                  <div className="mt-2 mb-7 flex justify-end">
                    <Link
                      to="/settings#remix"
                      className="text-muted-foreground hover:text-foreground px-2 text-[12px] underline transition-colors"
                    >
                      {t("remixPage.hotkey.change")}
                    </Link>
                  </div>
                </>
              )}

              {/* How to use it — one unified panel */}
              <div className="mb-7">
                <div className="text-muted-foreground mb-3 text-[10px]">
                  {t("remixPage.how.heading")}
                </div>
                <div className="border-border bg-card rounded-[14px] border p-5">
                  <ol className="flex flex-col gap-3.5">
                    <HowStep index={1}>{t("remixPage.how.step1")}</HowStep>
                    <HowStep index={2}>
                      {t("remixPage.how.step2Prefix")}{" "}
                      <span className="mx-0.5 inline-block align-middle">
                        <KeyComboDisplay
                          keys={formatAcceleratorKeys(remixHotkey)}
                        />
                      </span>{" "}
                      {t("remixPage.how.step2Suffix")}
                    </HowStep>
                    <HowStep index={3}>{t("remixPage.how.step3")}</HowStep>
                  </ol>
                  <p className="text-muted-foreground border-border mt-4 border-t pt-4 text-[13px] leading-[1.6]">
                    {t("remixPage.how.more")}
                  </p>
                </div>
              </div>

              {/* Example instructions — one card per quote */}
              {EXAMPLE_GROUPS.map((group) => (
                <div key={group.id} className="mb-7">
                  <div className="mb-3 flex items-center gap-1.5">
                    <div className="text-muted-foreground text-[10px]">
                      {t(`remixPage.examples.groups.${group.id}`)}
                    </div>
                    {group.web && (
                      <Globe className="text-muted-foreground h-2.5 w-2.5" />
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.quotes.map((quote) => (
                      <div
                        key={quote}
                        className="border-border bg-card rounded-[12px] border px-4 py-3.5"
                      >
                        <p className="text-foreground text-[14px] leading-[1.5]">
                          "{t(`remixPage.examples.quotes.${quote}`)}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Tips */}
              <div className="mb-10">
                <div className="text-muted-foreground mb-1 text-[10px]">
                  {t("remixPage.tips.heading")}
                </div>
                <div className="flex flex-col">
                  {(["highlight", "tap", "followUp"] as const).map((tip, i) => (
                    <p
                      key={tip}
                      className={cn(
                        "text-muted-foreground py-2.5 text-[12.5px] leading-[1.55]",
                        i > 0 && "border-border/60 border-t",
                      )}
                    >
                      {t(`remixPage.tips.${tip}`)}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryList({
  onOpen,
}: {
  onOpen: (threadId: number) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.remixThreads,
    queryFn: async () => {
      const res = await getClient().api.remix.thread.list.$get({
        query: { limit: 100 },
      });
      if (!res.ok) throw new Error("Failed to load remix history");
      return (await res.json()) as { threads: ThreadSummary[] };
    },
  });

  if (query.isLoading) {
    return (
      <div className="text-muted-foreground py-14 text-center text-[13px]">
        {t("remixPage.history.loading")}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="text-muted-foreground py-14 text-center text-[13px]">
        {t("remixPage.history.error")}
      </div>
    );
  }
  const threads = query.data?.threads ?? [];
  if (threads.length === 0) {
    return (
      <div className="border-border bg-card rounded-[14px] border border-dashed px-9 py-[56px] text-center">
        <div className="bg-accent mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl">
          <MessageSquareText className="text-primary h-6 w-6" />
        </div>
        <p className="text-foreground m-0 text-[15px] font-medium">
          {t("remixPage.history.emptyTitle")}
        </p>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-[380px] text-[13px] leading-[1.55]">
          {t("remixPage.history.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-10 flex flex-col gap-2">
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => onOpen(thread.id)}
          className="group border-border bg-card hover:border-border/80 hover:bg-accent/40 flex items-center gap-3 rounded-[12px] border px-4 py-3.5 text-left transition-colors"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-foreground line-clamp-2 text-[14px] leading-[1.45]">
              {thread.preview || t("remixPage.history.untitled")}
            </span>
            <span className="text-muted-foreground text-[11px]">
              {formatThreadTime(thread.lastActiveAt, i18n.language)}
              {" · "}
              {t("remixPage.history.messageCount", {
                count: thread.messageCount,
              })}
            </span>
          </div>
          <ChevronRight className="text-muted-foreground/50 group-hover:text-muted-foreground h-4 w-4 flex-shrink-0 transition-colors" />
        </button>
      ))}
    </div>
  );
}

function ThreadTranscript({
  threadId,
  onBack,
}: {
  threadId: number;
  onBack: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.remixThread(threadId),
    queryFn: async () => {
      const res = await getClient().api.remix.thread[":id"].$get({
        param: { id: String(threadId) },
      });
      if (!res.ok) throw new Error("Failed to load conversation");
      return (await res.json()) as unknown as {
        threadId: number;
        resumed: boolean;
        messages: TranscriptMessage[];
      };
    },
  });

  return (
    <div className="mb-10">
      <button
        type="button"
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground -ml-1 mb-5 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-medium transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {t("remixPage.history.back")}
      </button>

      {query.isLoading ? (
        <div className="text-muted-foreground py-14 text-center text-[13px]">
          {t("remixPage.history.loading")}
        </div>
      ) : query.isError ? (
        <div className="text-muted-foreground py-14 text-center text-[13px]">
          {t("remixPage.history.error")}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {(query.data?.messages ?? [])
            .filter((message) => message.role !== "system")
            .map((message) => {
              const text = textFromParts(message.parts);
              if (!text) return null;
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex flex-col gap-1",
                    isUser ? "items-end" : "items-start",
                  )}
                >
                  <span className="text-muted-foreground px-1 text-[10px] font-medium tracking-wide uppercase">
                    {isUser
                      ? t("remixPage.history.roleYou")
                      : t("remixPage.history.roleRemix")}
                  </span>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-[1.5] whitespace-pre-wrap",
                      isUser
                        ? "bg-accent text-accent-foreground"
                        : "border-border bg-card text-foreground border",
                    )}
                  >
                    {text}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/** Join a UIMessage's text parts into plain text (tool parts are skipped). */
function textFromParts(parts: TranscriptPart[]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
}

function formatThreadTime(value: string, locale: string): string {
  const date = parseSqliteDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const min = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "narrow",
  });
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, "hour");
  const days = Math.round(hr / 24);
  if (Math.abs(days) < 7) return rtf.format(-days, "day");
  return date.toLocaleDateString(locale);
}

type DemoPhase = "idle" | "pressed" | "result";

const PHASE_STEPS: ReadonlyArray<readonly [DemoPhase, number]> = [
  ["idle", 1800],
  ["pressed", 3600],
  ["result", 2400],
];

function RemixDemo({ hotkey }: { hotkey: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const stepRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const suspendedRef = useRef(false);
  const audioLevelRef = useRef(0);
  const livePressRef = useRef(false);

  const clearLoop = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (suspendedRef.current) return;
    const [name, dur] = PHASE_STEPS[stepRef.current % PHASE_STEPS.length];
    setPhase(name);
    stepRef.current += 1;
    timeoutRef.current = window.setTimeout(tick, dur);
  }, []);

  useEffect(() => {
    tick();
    return clearLoop;
  }, [tick, clearLoop]);

  useEffect(() => {
    const removeDown = window.api?.onRemixDown(() => {
      suspendedRef.current = true;
      livePressRef.current = true;
      audioLevelRef.current = 0;
      clearLoop();
      setPhase("pressed");
    });
    const removeUp = window.api?.onRemixUp(() => {
      livePressRef.current = false;
      setPhase("result");
      clearLoop();
      timeoutRef.current = window.setTimeout(() => {
        suspendedRef.current = false;
        stepRef.current = 0;
        tick();
      }, PHASE_STEPS[2][1]);
    });
    return () => {
      removeDown?.();
      removeUp?.();
    };
  }, [tick, clearLoop]);

  useEffect(() => {
    const remove = window.api?.onAudioLevel((level: number) => {
      audioLevelRef.current = level;
    });
    return () => remove?.();
  }, []);

  const getLiveLevel = useCallback(
    () => (livePressRef.current ? audioLevelRef.current : null),
    [],
  );

  const pressed = phase === "pressed";
  const showResult = phase === "result";
  const tokens = formatAcceleratorKeys(hotkey);

  return (
    <div className="border-border bg-card flex flex-col items-center gap-5 rounded-[16px] border px-7 py-7">
      <div className="select-none text-center">
        <div className="serif text-foreground text-[34px] leading-[1.1] font-normal tracking-tight">
          <StepWord active={phase === "idle"}>Hold</StepWord>{" "}
          <span className="inline-block align-middle">
            {tokens.map((tok, i) => (
              <span key={`${tok}-${i}`} className="inline-block align-middle">
                {i > 0 && (
                  <span className="text-muted-foreground mx-1 text-[16px]">
                    +
                  </span>
                )}
                <Keycap pressed={pressed} label={tok} />
              </span>
            ))}
          </span>{" "}
          <StepWord active={pressed}>, speak,</StepWord>{" "}
          <StepWord active={showResult}>release.</StepWord>
        </div>
      </div>

      <div
        className={cn(
          "relative w-full max-w-[560px] overflow-hidden rounded-[12px] border px-5 py-4 transition-colors duration-200",
          pressed ? "border-primary bg-accent" : "border-border bg-sidebar",
        )}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className={cn(
              "h-[7px] w-[7px] rounded-full transition-all duration-200",
              pressed || showResult
                ? "bg-primary opacity-100"
                : "bg-muted-foreground opacity-40",
            )}
            style={
              pressed ? { animation: "rdot 1.6s infinite ease-in-out" } : {}
            }
          />
          <span
            className={cn(
              "mono text-[10px] font-semibold tracking-[0.16em] uppercase transition-colors",
              pressed || showResult
                ? "text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            {phase === "idle"
              ? t("remixPage.demo.statusReady")
              : pressed
                ? t("remixPage.demo.statusListening")
                : t("remixPage.demo.statusDone")}
          </span>
        </div>

        <Wave pressed={pressed} getLiveLevel={getLiveLevel} />

        <div
          className="mt-1 min-h-[24px] transition-all duration-300"
          style={{
            opacity: showResult ? 1 : 0,
            transform: showResult ? "translateY(0)" : "translateY(4px)",
          }}
        >
          <span className="serif text-foreground text-[17px] leading-[1.4]">
            "{t("remixPage.examples.quotes.email")}"
          </span>
        </div>
      </div>

      <style>{`@keyframes rdot { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: 0.5 } }`}</style>
    </div>
  );
}

function HowStep({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className="flex items-baseline gap-3">
      <span className="mono text-muted-foreground shrink-0 text-[10px] tracking-[0.14em]">
        {String(index).padStart(2, "0")}
      </span>
      <span className="text-foreground text-[14px] leading-[1.6]">
        {children}
      </span>
    </li>
  );
}
