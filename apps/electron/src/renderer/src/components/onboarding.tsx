import "../onboarding.css";

import { ConnectorLogo } from "@renderer/components/connected-apps";
import { apiFetch } from "@renderer/lib/api";
import { readBrainFile, writeBrainFile } from "@renderer/lib/brain-fs";
import type { ConnectorCatalogItem } from "@renderer/lib/connectors";
import {
  AUTOMATION_LABELS,
  BEATS,
  type BeatId,
  beatLines,
  CALENDAR_TEMPLATE_IDS,
  EASTER_EGGS,
  EMAIL_TEMPLATE_IDS,
  firstNameOf,
  handoffCta,
  jobPlaceholder,
  ONBOARDING_CALENDAR_APPS,
  ONBOARDING_EMAIL_APPS,
  ONBOARDING_KEY,
  type OnboardingSaved,
  PROFILE_INDEX_LINE,
  PROFILE_PATH,
  parseSaved,
  profileMarkdown,
  questFor,
  SKIP_LINE,
  TRADE_CHIPS,
} from "@renderer/lib/onboarding-core";
import {
  connectorConnectionsQueryOptions,
  connectorSuggestedQueryOptions,
} from "@renderer/lib/query";
import { applyAutomationTemplates } from "@renderer/lib/scheduled-templates";
import {
  type ConnectPhase,
  useConnectorConnect,
} from "@renderer/lib/use-connector-connect";
import { useUpdateProfileFields } from "@renderer/lib/use-profile";
import type { CloudUser } from "@shared/cloud-user";
import type { SpriteId } from "@shared/sprites";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function persistSaved(state: OnboardingSaved): void {
  void apiFetch(`/api/settings/${ONBOARDING_KEY}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(state) }),
  }).catch(() => {});
}

export type OnboardingStatus = "loading" | "show" | "done";

/**
 * Whether the signed-in user still owes Jeb an introduction. Users with chat
 * history who've never seen the flow are grandfathered as complete — the
 * intro is for people meeting the product, not people already using it.
 */
export function useOnboarding(enabled: boolean): {
  status: OnboardingStatus;
  saved: OnboardingSaved | null;
  markDone: (task: string) => void;
  replay: () => void;
} {
  const [status, setStatus] = useState<OnboardingStatus>("loading");
  const [saved, setSaved] = useState<OnboardingSaved | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const [settings, threads] = await Promise.all([
        apiFetch("/api/settings")
          .then(async (res) =>
            res.ok
              ? ((await res.json()) as Record<string, string>)
              : ({} as Record<string, string>),
          )
          .catch(() => ({}) as Record<string, string>),
        apiFetch("/api/agent/thread/list")
          .then(async (res) =>
            res.ok
              ? ((await res.json()) as { threads: unknown[] }).threads
              : [],
          )
          .catch(() => []),
      ]);
      if (cancelled) return;
      const parsed = parseSaved(settings[ONBOARDING_KEY]);
      setSaved(parsed);
      if (parsed?.done) {
        setStatus("done");
      } else if (parsed) {
        setStatus("show");
      } else if (threads.length > 0) {
        const grandfathered: OnboardingSaved = { v: 2, done: true };
        persistSaved(grandfathered);
        setSaved(grandfathered);
        setStatus("done");
      } else {
        setStatus("show");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const markDone = useCallback((task: string): void => {
    setSaved((prev) => {
      const next: OnboardingSaved = {
        v: 2,
        done: true,
        task: task.trim(),
        ...(prev?.connected?.length ? { connected: prev.connected } : {}),
        ...(prev?.automations?.length ? { automations: prev.automations } : {}),
        ...(prev?.replayed ? { replayed: true } : {}),
      };
      persistSaved(next);
      return next;
    });
    setStatus("done");
  }, []);

  const replay = useCallback((): void => {
    const next: OnboardingSaved = { v: 2, done: false, replayed: true };
    persistSaved(next);
    setSaved(next);
    setStatus("show");
  }, []);

  return { status, saved, markDone, replay };
}

/** The goal's real write: the user's own sentence onto their own list. */
async function seedTodo(quest: string): Promise<void> {
  const todos = await readBrainFile("todos.md");
  if (todos?.includes(quest)) return;
  const base = todos?.trimEnd() ? `${todos.trimEnd()}\n` : "";
  await writeBrainFile("todos.md", `${base}- [ ] ${quest}\n`);
}

/** The profile's real write: the profile page plus its index line. */
async function seedProfile(name: string, trade: string): Promise<void> {
  await writeBrainFile(PROFILE_PATH, profileMarkdown(name, trade));
  const index = await readBrainFile("BRAIN.md");
  if (index === null || !index.trim()) {
    await writeBrainFile("BRAIN.md", `# Brain\n\n${PROFILE_INDEX_LINE}\n`);
  } else if (!index.includes(PROFILE_PATH)) {
    await writeBrainFile(
      "BRAIN.md",
      `${index.trimEnd()}\n${PROFILE_INDEX_LINE}\n`,
    );
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useTypewriter(text: string): {
  shown: string;
  typing: boolean;
  finish: () => void;
} {
  const [count, setCount] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCount(text.length);
      return;
    }
    setCount(0);
    timer.current = window.setInterval(() => {
      setCount((prev) => {
        if (prev >= text.length) {
          if (timer.current) window.clearInterval(timer.current);
          return prev;
        }
        return prev + 1;
      });
    }, 12);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [text]);

  const finish = useCallback((): void => {
    if (timer.current) window.clearInterval(timer.current);
    setCount(text.length);
  }, [text]);

  return { shown: text.slice(0, count), typing: count < text.length, finish };
}

const APP_FALLBACK_NAMES: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  googlecalendar: "Google Calendar",
};

function ConnectStage({
  apps,
  templates,
  suggested,
  activeSlugs,
  phases,
  applied,
  onConnect,
}: {
  apps: readonly string[];
  templates: readonly string[];
  suggested: ConnectorCatalogItem[];
  activeSlugs: ReadonlySet<string>;
  phases: Record<string, ConnectPhase>;
  applied: ReadonlySet<string>;
  onConnect: (slug: string) => void;
}): React.JSX.Element {
  const anyConnected = apps.some((slug) => activeSlugs.has(slug));
  return (
    <div className="tavern-onb-connect">
      <div className="tavern-onb-apps">
        {apps.map((slug) => {
          const item = suggested.find((entry) => entry.slug === slug);
          const name = item?.name ?? APP_FALLBACK_NAMES[slug] ?? slug;
          const connected = activeSlugs.has(slug);
          const phase = phases[slug];
          return (
            <div
              key={slug}
              className={`tavern-onb-app${connected ? " is-on" : ""}`}
            >
              <ConnectorLogo name={name} logo={item?.logo} />
              <span className="tavern-onb-app-name">{name}</span>
              {connected ? (
                <span className="tavern-onb-app-done">Connected ✓</span>
              ) : (
                <button
                  type="button"
                  className="tavern-onb-cta is-small"
                  disabled={phase === "opening" || phase === "pending"}
                  onClick={() => onConnect(slug)}
                >
                  {phase === "opening"
                    ? "Opening…"
                    : phase === "pending"
                      ? "In browser…"
                      : "Connect"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <ul className="tavern-onb-autos">
        {templates.map((id) => (
          <li key={id} className={applied.has(id) ? "is-set" : ""}>
            <i>{applied.has(id) ? "✓" : "◇"}</i>
            {AUTOMATION_LABELS[id] ?? id}
          </li>
        ))}
      </ul>
      {anyConnected && templates.some((id) => !applied.has(id)) ? (
        <span className="tavern-onb-writing">setting up…</span>
      ) : null}
    </div>
  );
}

function ReceiptStage({
  connectedNames,
  automations,
  quest,
  hasTask,
}: {
  connectedNames: string[];
  automations: string[];
  quest: string;
  hasTask: boolean;
}): React.JSX.Element {
  return (
    <div className="tavern-onb-receipt">
      <div className="tavern-onb-bigq">
        On <i>watch.</i>
      </div>
      <ul className="tavern-onb-rlist">
        {connectedNames.length > 0 ? (
          <li>
            <b>Connected</b>
            <span>{connectedNames.join(" · ")}</span>
          </li>
        ) : (
          <li className="is-dim">
            <b>Connected</b>
            <span>nothing yet — the Apps tab is always there</span>
          </li>
        )}
        {automations.length > 0 ? (
          <li>
            <b>Automations</b>
            <span>
              {automations.map((id) => AUTOMATION_LABELS[id] ?? id).join(" · ")}
            </span>
          </li>
        ) : null}
        {hasTask ? (
          <li>
            <b>First job</b>
            <span>{quest}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function OnboardingGate({
  user,
  spriteForm,
  saved,
  onDone,
}: {
  user: CloudUser;
  spriteForm: SpriteId;
  saved: OnboardingSaved | null;
  onDone: (task: string) => void;
}): React.JSX.Element {
  void spriteForm;
  const [beat, setBeat] = useState<BeatId>(() =>
    saved?.beat && BEATS.includes(saved.beat) ? saved.beat : "name",
  );
  const [lineIdx, setLineIdx] = useState(0);
  const [name, setName] = useState(saved?.name ?? user.name ?? "");
  const [trade, setTrade] = useState(saved?.trade ?? "");
  const [task, setTask] = useState(saved?.task ?? "");
  const [applied, setApplied] = useState<ReadonlySet<string>>(
    () => new Set(saved?.automations ?? []),
  );
  const [skipping, setSkipping] = useState(false);
  const [egg, setEgg] = useState<string | null>(null);
  const eggIdx = useRef(0);
  const eggTimer = useRef<number | null>(null);
  const todoStarted = useRef(false);
  const profileStarted = useRef(false);
  const emailApplying = useRef(false);
  const calendarApplying = useRef(false);
  const updateProfile = useUpdateProfileFields();

  const { connect, phases } = useConnectorConnect();
  const connectionsQuery = useQuery(connectorConnectionsQueryOptions());
  const suggestedQuery = useQuery(connectorSuggestedQueryOptions());
  const suggested = useMemo(
    () => suggestedQuery.data?.connectors ?? [],
    [suggestedQuery.data],
  );

  const activeSlugs = useMemo(() => {
    const slugs = new Set(
      (connectionsQuery.data ?? [])
        .filter((connection) => connection.status === "active")
        .map((connection) => connection.toolkitSlug),
    );
    for (const [slug, phase] of Object.entries(phases)) {
      if (phase === "connected") slugs.add(slug);
    }
    return slugs;
  }, [connectionsQuery.data, phases]);

  const beatIndex = BEATS.indexOf(beat);
  const emailConnected = ONBOARDING_EMAIL_APPS.some((slug) =>
    activeSlugs.has(slug),
  );
  const calendarConnected = ONBOARDING_CALENDAR_APPS.some((slug) =>
    activeSlugs.has(slug),
  );

  const scene = beatLines(beat, {
    name,
    trade,
    task,
    accountName: user.name,
    emailConnected,
    calendarConnected,
  });
  const lastIdx = scene.lines.length - 1;
  const atLastLine = lineIdx >= lastIdx;

  const rawLine = scene.lines[Math.min(lineIdx, lastIdx)];
  const line = skipping ? SKIP_LINE : rawLine;
  const hint = skipping || !atLastLine ? undefined : scene.hint;

  const { shown, typing, finish } = useTypewriter(line);

  const persist = useCallback(
    (nextBeat: BeatId): void => {
      persistSaved({
        v: 2,
        done: false,
        beat: nextBeat,
        name: name.trim(),
        trade: trade.trim(),
        task: task.trim(),
        connected: [...activeSlugs].filter((slug) =>
          [...ONBOARDING_EMAIL_APPS, ...ONBOARDING_CALENDAR_APPS].includes(
            slug as (typeof ONBOARDING_EMAIL_APPS)[number],
          ),
        ),
        automations: [...applied],
        ...(saved?.replayed ? { replayed: true } : {}),
      });
    },
    [name, trade, task, activeSlugs, applied, saved],
  );

  const beatDone = beat !== "name" || name.trim().length > 0;

  const advanceBeat = useCallback((): void => {
    const index = BEATS.indexOf(beat);
    const next = BEATS[index + 1];
    if (!next) return;
    setBeat(next);
    setLineIdx(0);
    persist(next);
  }, [beat, persist]);

  const advance = useCallback((): void => {
    if (skipping) return;
    if (typing) {
      finish();
      return;
    }
    if (!atLastLine) {
      setLineIdx((prev) => prev + 1);
      return;
    }
    if (beatDone && beat !== "receipt") advanceBeat();
  }, [skipping, typing, finish, atLastLine, beatDone, beat, advanceBeat]);

  // Opening flourish from the real corner sprite.
  useEffect(() => {
    if (beat === "name") {
      window.api.spriteEvent({ kind: "emote", emotion: "proud" });
    }
  }, [beat]);

  // Automations follow connections: once the flow has reached the matching
  // beat and an app in the group is active, the templates are applied
  // server-side. Idempotent there, so replays and re-renders are safe.
  useEffect(() => {
    if (beatIndex < BEATS.indexOf("inbox")) return;
    if (!emailConnected || emailApplying.current) return;
    if (EMAIL_TEMPLATE_IDS.every((id) => applied.has(id))) return;
    emailApplying.current = true;
    void applyAutomationTemplates([...EMAIL_TEMPLATE_IDS])
      .then((result) => {
        window.api.spriteEvent({ kind: "emote", emotion: "proud" });
        setApplied((prev) => {
          const next = new Set(prev);
          for (const entry of result.applied) next.add(entry.id);
          for (const entry of result.skipped)
            if (entry.reason === "exists") next.add(entry.id);
          return next;
        });
      })
      .catch(() => {
        emailApplying.current = false;
      });
  }, [beatIndex, emailConnected, applied]);

  useEffect(() => {
    if (beatIndex < BEATS.indexOf("compass")) return;
    if (!calendarConnected || calendarApplying.current) return;
    if (CALENDAR_TEMPLATE_IDS.every((id) => applied.has(id))) return;
    calendarApplying.current = true;
    void applyAutomationTemplates([...CALENDAR_TEMPLATE_IDS])
      .then((result) => {
        window.api.spriteEvent({ kind: "emote", emotion: "proud" });
        setApplied((prev) => {
          const next = new Set(prev);
          for (const entry of result.applied) next.add(entry.id);
          for (const entry of result.skipped)
            if (entry.reason === "exists") next.add(entry.id);
          return next;
        });
      })
      .catch(() => {
        calendarApplying.current = false;
      });
  }, [beatIndex, calendarConnected, applied]);

  // The receipt does the quiet writes: the goal onto the real list, the
  // profile into the brain. Keys on the beat alone, same contract as v1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (beat !== "receipt") return;
    if (!todoStarted.current && task.trim()) {
      todoStarted.current = true;
      void seedTodo(questFor(task)).catch(() => {});
    }
    if (!profileStarted.current) {
      profileStarted.current = true;
      void seedProfile(firstNameOf(name) ? name.trim() : "friend", trade.trim())
        .catch(() => {})
        .then(() => {
          if (trade.trim()) {
            updateProfile
              .mutateAsync({ jobTitle: trade.trim() })
              .catch(() => {});
          }
        });
    }
  }, [beat]);

  useEffect(() => {
    return () => {
      if (eggTimer.current) window.clearTimeout(eggTimer.current);
    };
  }, []);

  const pokeNameplate = (): void => {
    const next = EASTER_EGGS[eggIdx.current % EASTER_EGGS.length];
    eggIdx.current += 1;
    setEgg(next);
    if (eggTimer.current) window.clearTimeout(eggTimer.current);
    eggTimer.current = window.setTimeout(() => setEgg(null), 2500);
  };

  const skip = (): void => {
    if (skipping) return;
    setSkipping(true);
    if (!todoStarted.current && task.trim()) {
      todoStarted.current = true;
      void seedTodo(questFor(task)).catch(() => {});
    }
    if (!profileStarted.current && name.trim()) {
      profileStarted.current = true;
      void seedProfile(name.trim(), trade.trim()).catch(() => {});
    }
    window.setTimeout(() => onDone(task.trim()), 1400);
  };

  const complete = useCallback((): void => {
    window.api.spriteEvent({ kind: "turn", phase: "done" });
    onDone(task.trim());
  }, [onDone, task]);

  // Enter anywhere is Next: finishes the typing line, steps the scene, and
  // advances the beat — including the receipt CTA. Buttons keep their native
  // Enter activation (handling it here too would double-fire), and the
  // gating lives in advance()/beatDone, so a blocked beat just holds.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Enter" || e.isComposing || skipping) return;
      if ((e.target as HTMLElement | null)?.tagName === "BUTTON") return;
      e.preventDefault();
      if (beat === "receipt" && atLastLine && !typing) {
        complete();
        return;
      }
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skipping, beat, atLastLine, typing, complete, advance]);

  const inputReady = atLastLine && !typing && !skipping;
  const connectedNames = useMemo(() => {
    const wanted = new Set([
      ...ONBOARDING_EMAIL_APPS,
      ...ONBOARDING_CALENDAR_APPS,
    ]);
    return [...activeSlugs]
      .filter((slug) => wanted.has(slug as never))
      .map(
        (slug) =>
          suggested.find((entry) => entry.slug === slug)?.name ??
          APP_FALLBACK_NAMES[slug] ??
          slug,
      );
  }, [activeSlugs, suggested]);

  const nextLabel =
    beat === "inbox"
      ? emailConnected
        ? "Next ▸"
        : "Later ▸"
      : beat === "compass"
        ? calendarConnected
          ? "Next ▸"
          : "Later ▸"
        : "Next ▸";

  return (
    <div className="tavern-onb" data-beat={beat} data-line={lineIdx}>
      <div className="tavern-onb-head">
        <span className="tavern-head-name">
          freestyle<i>.</i>
        </span>
        <button type="button" className="tavern-onb-skip" onClick={skip}>
          skip intro ↦
        </button>
      </div>

      <div className="tavern-onb-prog" aria-hidden="true">
        {BEATS.map((b) => (
          <span
            key={b}
            className={`tavern-onb-dot${
              BEATS.indexOf(b) <= BEATS.indexOf(beat) ? " is-lit" : ""
            }`}
          />
        ))}
      </div>

      <div className="tavern-onb-stage">
        {beat === "name" ? (
          <>
            <div className="tavern-onb-bigq">
              Nothing slips
              <br />
              past <i>Jeb.</i>
            </div>
            {inputReady ? (
              <input
                className="tavern-onb-in"
                value={name}
                maxLength={80}
                placeholder="Your name"
                // biome-ignore lint/a11y/noAutofocus: the input is the beat's whole point
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
            ) : null}
          </>
        ) : null}

        {beat === "trade" && inputReady ? (
          <>
            <input
              className="tavern-onb-in"
              value={trade}
              maxLength={120}
              placeholder="Anything. I've heard stranger."
              // biome-ignore lint/a11y/noAutofocus: the input is the beat's whole point
              autoFocus
              onChange={(e) => setTrade(e.target.value)}
            />
            <div className="tavern-onb-chips">
              {TRADE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`tavern-onb-chip${trade === chip ? " is-on" : ""}`}
                  onClick={() => setTrade(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {beat === "inbox" && !skipping ? (
          <ConnectStage
            apps={ONBOARDING_EMAIL_APPS}
            templates={EMAIL_TEMPLATE_IDS}
            suggested={suggested}
            activeSlugs={activeSlugs}
            phases={phases}
            applied={applied}
            onConnect={connect}
          />
        ) : null}

        {beat === "compass" && !skipping ? (
          <ConnectStage
            apps={ONBOARDING_CALENDAR_APPS}
            templates={CALENDAR_TEMPLATE_IDS}
            suggested={suggested}
            activeSlugs={activeSlugs}
            phases={phases}
            applied={applied}
            onConnect={connect}
          />
        ) : null}

        {beat === "goal" && inputReady ? (
          <>
            <div className="tavern-onb-bigq">
              One thing,
              <br />
              today or <i>tomorrow.</i>
            </div>
            <input
              className="tavern-onb-in"
              value={task}
              maxLength={200}
              placeholder={jobPlaceholder(trade)}
              // biome-ignore lint/a11y/noAutofocus: the input is the beat's whole point
              autoFocus
              onChange={(e) => setTask(e.target.value)}
            />
          </>
        ) : null}

        {beat === "receipt" && !skipping ? (
          <ReceiptStage
            connectedNames={connectedNames}
            automations={[...applied]}
            quest={questFor(task)}
            hasTask={task.trim().length > 0}
          />
        ) : null}
      </div>

      {/* Jeb speaks from the bottom; the tail points down-left at the real
          companion sprite on the desktop. One Jeb on screen, ever. */}
      <div className="tavern-onb-say">
        <button
          type="button"
          className="tavern-onb-who"
          onClick={pokeNameplate}
        >
          JEB
        </button>
        {egg ? <span className="tavern-onb-egg">{egg}</span> : null}
        <span className="tavern-onb-tail-o" />
        <span className="tavern-onb-tail-f" />
        <button
          type="button"
          className="tavern-onb-saytext"
          onClick={() => {
            if (!skipping && (typing || !atLastLine)) advance();
          }}
        >
          {shown}
          {typing ? <span className="tavern-onb-caret">▮</span> : null}
          {!typing && hint ? (
            <span className="tavern-onb-hint">{hint}</span>
          ) : null}
        </button>
      </div>

      <div className="tavern-onb-foot2">
        <span />
        {beat === "receipt" && atLastLine ? (
          <button
            type="button"
            className="tavern-onb-cta"
            disabled={typing || skipping}
            onClick={complete}
          >
            {handoffCta(task)}
          </button>
        ) : (
          <button
            type="button"
            className="tavern-onb-next"
            disabled={typing || skipping || (atLastLine && !beatDone)}
            onClick={advance}
          >
            {atLastLine ? nextLabel : "▸"}
          </button>
        )}
      </div>
    </div>
  );
}
