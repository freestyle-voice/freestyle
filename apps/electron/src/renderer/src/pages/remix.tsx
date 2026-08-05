import { DragSpacer } from "@renderer/components/drag-spacer";
import { KeyComboDisplay } from "@renderer/components/key-combo";
import {
  Keycap,
  StepWord,
  Wave,
} from "@renderer/components/onboarding/coach-strip";
import { formatAcceleratorKeys } from "@renderer/hooks/use-hotkey-recorder";
import { getClient } from "@renderer/lib/api";
import { formatNumber } from "@renderer/lib/format";
import { queryKeys, settingsQueryOptions } from "@renderer/lib/query";
import { cn } from "@renderer/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { getDefaultRemixHotkey } from "../../../shared/remix";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";

const RUNS_SAMPLE_LIMIT = 200;
const RAIL_WIDTH = 300;

interface RemixRunRow {
  id: number;
  app_name: string | null;
  created_at: string;
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

// SQLite datetime('now') is UTC without a zone marker.
function parseRunDate(createdAt: string): Date {
  return new Date(`${createdAt.replace(" ", "T")}Z`);
}

function relativeTime(date: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "narrow",
  });
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(days, "day");
}

export default function RemixPage(): React.JSX.Element {
  const { t } = useTranslation();

  const { data: settings } = useQuery(settingsQueryOptions());
  const remixHotkey =
    settings?.[SETTINGS_KEYS.remixHotkey] ||
    window.api?.defaultRemixHotkey ||
    getDefaultRemixHotkey();

  const runsQuery = useQuery({
    queryKey: queryKeys.remixRuns,
    queryFn: async () => {
      const res = await getClient().api.remix.runs.$get({
        query: { limit: RUNS_SAMPLE_LIMIT },
      });
      if (!res.ok) throw new Error("Failed to load remix runs");
      return (await res.json()) as { runs: RemixRunRow[] };
    },
  });
  const runs = runsQuery.data?.runs ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DragSpacer />
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `minmax(0,1fr) ${RAIL_WIDTH}px` }}
      >
        <div
          className="responsive-page-scroll min-w-0 overflow-auto pt-5 pr-5"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          {/* Demo hero — same UI as the Transcriptions tab's tutorial */}
          <RemixDemo hotkey={remixHotkey} />
          <div className="mt-2 mb-7 flex justify-end">
            <Link
              to="/settings#remix"
              className="text-muted-foreground hover:text-foreground px-2 text-[12px] underline transition-colors"
            >
              {t("remixPage.hotkey.change")}
            </Link>
          </div>

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
        </div>

        {/* Usage rail — mirrors the Transcriptions page's stats panel */}
        <div className="border-border/70 relative min-h-0 border-l">
          <aside className="flex h-full min-h-0 flex-col overflow-auto px-4 py-5 shadow-[-12px_0_28px_-28px_var(--glass-shadow)]">
            <div className="text-muted-foreground mb-2.5 pt-2 text-[10px]">
              {t("remixPage.stats.heading")}
            </div>
            <UsageStats runs={runs} />
          </aside>
        </div>
      </div>
    </div>
  );
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

function UsageStats({ runs }: { runs: RemixRunRow[] }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const runCount =
    runs.length >= RUNS_SAMPLE_LIMIT
      ? `${formatNumber(RUNS_SAMPLE_LIMIT)}+`
      : formatNumber(runs.length);
  const appCount = new Set(
    runs.map((run) => run.app_name?.trim()).filter(Boolean),
  ).size;
  const lastRun = runs[0] ? parseRunDate(runs[0].created_at) : null;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <StatCard
        span2
        inline
        accent
        n={runCount}
        l={t("remixPage.stats.remixes")}
        sub={runs.length === 0 ? t("remixPage.stats.firstHint") : undefined}
      />
      <StatCard n={formatNumber(appCount)} l={t("remixPage.stats.apps")} />
      <StatCard
        small
        n={lastRun ? relativeTime(lastRun, i18n.language) : "—"}
        l={t("remixPage.stats.lastRemix")}
      />
    </div>
  );
}

function StatCard({
  n,
  l,
  sub,
  accent,
  span2,
  inline,
  small,
}: {
  n: string;
  l: string;
  sub?: string;
  accent?: boolean;
  span2?: boolean;
  inline?: boolean;
  small?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "border-border/70 bg-card/35 rounded-lg border px-3.5 py-3",
        span2 && "col-span-2",
      )}
    >
      {inline ? (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "serif-italic text-[30px] leading-none",
                accent ? "text-primary" : "text-foreground",
              )}
            >
              {n}
            </span>
            <span className="text-muted-foreground text-[9.5px]">{l}</span>
          </div>
          {sub && (
            <div className="text-muted-foreground/70 mt-1.5 text-[9.5px]">
              {sub}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className={cn(
              "serif-italic leading-none",
              small ? "pt-1.5 pb-[3px] text-[19px]" : "text-[30px]",
              accent ? "text-primary" : "text-foreground",
            )}
          >
            {n}
          </div>
          <div className="text-muted-foreground mt-2 text-[9.5px] leading-tight">
            {l}
          </div>
        </>
      )}
    </div>
  );
}
