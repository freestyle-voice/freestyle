import { apiFetch } from "@renderer/lib/api";
import { readBrainFile, writeBrainFile } from "@renderer/lib/brain-fs";
import {
  BEATS,
  type BeatId,
  beatLines,
  EASTER_EGGS,
  firstNameOf,
  handoffCta,
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
import { useUpdateProfileFields } from "@renderer/lib/use-profile";
import { SpriteBadge } from "@renderer/sprites/badge";
import type { CloudUser } from "@shared/cloud-user";
import type { SpriteId } from "@shared/sprites";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
        const grandfathered: OnboardingSaved = { v: 1, done: true };
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
        v: 1,
        done: true,
        task: task.trim(),
        ...(prev?.replayed ? { replayed: true } : {}),
      };
      persistSaved(next);
      return next;
    });
    setStatus("done");
  }, []);

  const replay = useCallback((): void => {
    const next: OnboardingSaved = { v: 1, done: false, replayed: true };
    persistSaved(next);
    setSaved(next);
    setStatus("show");
  }, []);

  return { status, saved, markDone, replay };
}

/** Beat 5's real write: the user's own sentence onto their own list. */
async function seedTodo(quest: string): Promise<void> {
  const todos = await readBrainFile("todos.md");
  if (todos?.includes(quest)) return;
  const base = todos?.trimEnd() ? `${todos.trimEnd()}\n` : "";
  await writeBrainFile("todos.md", `${base}- [ ] ${quest}\n`);
}

/** Beat 6's real write: the ledger page plus its index line. */
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

function TodoCard({
  quest,
  seeded,
}: {
  quest: string;
  seeded: boolean;
}): React.JSX.Element {
  return (
    <div className="tavern-onb-card">
      <span className="tavern-onb-card-title">Your todos</span>
      {seeded ? (
        <span className="tavern-onb-todo-row">
          <i className="tavern-onb-todo-box" />
          {quest}
        </span>
      ) : (
        <span className="tavern-onb-card-writing">writing…</span>
      )}
    </div>
  );
}

function BrainCard({
  name,
  trade,
  seeded,
}: {
  name: string;
  trade: string;
  seeded: boolean;
}): React.JSX.Element {
  return (
    <div className="tavern-onb-card">
      <span className="tavern-onb-card-title">Jeb's brain</span>
      <span className="tavern-onb-brain-row">
        <b>Memories</b>
        {seeded ? ` — ${name}${trade ? `, ${trade.toLowerCase()}` : ""}` : ""}
        {seeded ? null : <i className="tavern-onb-card-writing"> — writing…</i>}
      </span>
      <span className="tavern-onb-brain-row">
        <b>Notes</b> — anything worth keeping
      </span>
      <span className="tavern-onb-brain-row">
        <b>Skills</b> — how you like things done
      </span>
    </div>
  );
}

function BladeCard(): React.JSX.Element {
  return (
    <div className="tavern-onb-card">
      <span className="tavern-onb-card-title">history homework</span>
      <span className="tavern-onb-demo-line">
        Q3: <mark className="tavern-onb-mark">What ended the Edo period?</mark>
      </span>
      <span className="tavern-onb-demo-answer">
        ✎ The Meiji Restoration — 1868.
        <i className="tavern-onb-cursor">▮</i>
        <b className="tavern-onb-card-badge is-ok">✓ approved</b>
      </span>
    </div>
  );
}

function RoadCard(): React.JSX.Element {
  return (
    <div className="tavern-onb-card">
      <span className="tavern-onb-card-title">⌕ latest news in Austin</span>
      <span className="tavern-onb-demo-line">
        “City breaks ground on new transit line”
      </span>
      <span className="tavern-onb-demo-source">
        Austin Chronicle — this morning
      </span>
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
  const [beat, setBeat] = useState<BeatId>(() =>
    saved?.beat && BEATS.includes(saved.beat) ? saved.beat : "welcome",
  );
  const [lineIdx, setLineIdx] = useState(0);
  const [name, setName] = useState(saved?.name ?? user.name ?? "");
  const [trade, setTrade] = useState(saved?.trade ?? "");
  const [task, setTask] = useState(saved?.task ?? "");
  const [todoSeeded, setTodoSeeded] = useState(false);
  const [profileSeeded, setProfileSeeded] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [egg, setEgg] = useState<string | null>(null);
  const eggIdx = useRef(0);
  const eggTimer = useRef<number | null>(null);
  const todoStarted = useRef(false);
  const profileStarted = useRef(false);
  const traveled = useRef(false);
  const updateProfile = useUpdateProfileFields();

  const scene = beatLines(beat, {
    name,
    trade,
    task,
    accountName: user.name,
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
        v: 1,
        done: false,
        beat: nextBeat,
        name: name.trim(),
        trade: trade.trim(),
        task: task.trim(),
        ...(saved?.replayed ? { replayed: true } : {}),
      });
    },
    [name, trade, task, saved],
  );

  const beatDone =
    beat === "name"
      ? name.trim().length > 0
      : beat === "list"
        ? todoSeeded
        : beat !== "ledger" || profileSeeded;

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
    if (beatDone && beat !== "handoff") advanceBeat();
  }, [skipping, typing, finish, atLastLine, beatDone, beat, advanceBeat]);

  // Welcome flourish, as before.
  useEffect(() => {
    if (beat === "welcome") {
      window.api.spriteEvent({ kind: "emote", emotion: "proud" });
    }
  }, [beat]);

  // Beat 5: the user's sentence lands on their real list while Jeb types.
  // Reads the entry render's closure and keys on the beat alone — re-running
  // on render identities would clear the timer behind the ref guard.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (beat !== "list" || todoStarted.current) return;
    todoStarted.current = true;
    window.api.spriteEvent({ kind: "thinking", on: true });
    const delay = prefersReducedMotion() ? 0 : 700;
    const t = window.setTimeout(() => {
      void seedTodo(questFor(task))
        .catch(() => {})
        .then(() => {
          window.api.spriteEvent({ kind: "thinking", on: false });
          window.api.spriteEvent({ kind: "emote", emotion: "proud" });
          setTodoSeeded(true);
        });
    }, delay);
    return () => window.clearTimeout(t);
  }, [beat]);

  // Beat 6: the ledger page is written for real, plus the profile prefill.
  // biome-ignore lint/correctness/useExhaustiveDependencies: same contract as beat 5
  useEffect(() => {
    if (beat !== "ledger" || profileStarted.current) return;
    profileStarted.current = true;
    void seedProfile(firstNameOf(name) ? name.trim() : "friend", trade.trim())
      .catch(() => {})
      .then(() => {
        if (trade.trim()) {
          updateProfile.mutateAsync({ jobTitle: trade.trim() }).catch(() => {});
        }
        window.api.spriteEvent({ kind: "emote", emotion: "proud" });
        setProfileSeeded(true);
      });
  }, [beat]);

  // Beat 9 opens on "…Watch." — Jeb genuinely crosses the screen, timed to
  // land as the line finishes typing.
  useEffect(() => {
    if (beat !== "corner" || traveled.current) return;
    traveled.current = true;
    // No cleanup on either timer: the end event must land even if the user
    // advances before the dash finishes, or the sprite is stranded mid-travel.
    window.setTimeout(() => {
      window.api.spriteEvent({
        kind: "travel",
        phase: "start",
        travelKind: "dash",
        direction: "left",
      });
    }, 550);
    window.setTimeout(() => {
      window.api.spriteEvent({
        kind: "travel",
        phase: "end",
        travelKind: "dash",
        direction: "left",
      });
      window.api.spriteEvent({ kind: "emote", emotion: "proud" });
    }, 1450);
  }, [beat]);

  useEffect(() => {
    return () => {
      if (eggTimer.current) window.clearTimeout(eggTimer.current);
    };
  }, []);

  const pokePortrait = (): void => {
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

  const complete = (): void => {
    window.api.spriteEvent({ kind: "turn", phase: "done" });
    onDone(task.trim());
  };

  const inputBeat = atLastLine && !typing && !skipping;

  const submitOnEnter = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && beatDone) {
      e.preventDefault();
      advance();
    }
  };

  return (
    <div className="tavern-onb" data-beat={beat} data-line={lineIdx}>
      <div className="tavern-onb-top">
        <button type="button" className="tavern-onb-skip" onClick={skip}>
          skip intro ↦
        </button>
      </div>

      <div className="tavern-onb-portrait">
        <button
          type="button"
          className="tavern-onb-poke"
          aria-label="Jeb"
          onClick={pokePortrait}
        >
          <SpriteBadge
            form={spriteForm}
            size={72}
            working={beat === "list" && !todoSeeded}
          />
        </button>
        <span className="tavern-onb-nameplate">JEB</span>
        {egg ? <span className="tavern-onb-egg">{egg}</span> : null}
      </div>

      {/* Clicking the bubble finishes the line, then steps through the
          scene, then advances dialogue-only beats — the RPG contract. */}
      <button
        type="button"
        className="tavern-onb-bubble"
        onClick={() => {
          if (
            !skipping &&
            (typing ||
              !atLastLine ||
              !["name", "trade", "job", "handoff"].includes(beat))
          )
            advance();
        }}
      >
        {shown}
        {typing ? <span className="tavern-onb-caret">▮</span> : null}
        {!typing && hint ? (
          <span className="tavern-onb-hint">{hint}</span>
        ) : null}
      </button>

      <div className="tavern-onb-zone">
        {beat === "name" && inputBeat ? (
          <input
            className="tavern-set-input tavern-onb-input"
            value={name}
            maxLength={80}
            placeholder="Your name"
            // biome-ignore lint/a11y/noAutofocus: the input is the beat's whole point
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={submitOnEnter}
          />
        ) : null}

        {beat === "trade" && inputBeat ? (
          <>
            <input
              className="tavern-set-input tavern-onb-input"
              value={trade}
              maxLength={120}
              placeholder="Anything. I've heard stranger."
              // biome-ignore lint/a11y/noAutofocus: the input is the beat's whole point
              autoFocus
              onChange={(e) => setTrade(e.target.value)}
              onKeyDown={submitOnEnter}
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

        {beat === "job" && inputBeat ? (
          <input
            className="tavern-set-input tavern-onb-input is-wide"
            value={task}
            maxLength={200}
            placeholder="Finish doing laundry in the evening"
            // biome-ignore lint/a11y/noAutofocus: the input is the beat's whole point
            autoFocus
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={submitOnEnter}
          />
        ) : null}

        {beat === "list" && lineIdx >= 1 && !skipping ? (
          <TodoCard quest={questFor(task)} seeded={todoSeeded} />
        ) : null}

        {beat === "ledger" && !skipping ? (
          <BrainCard
            name={firstNameOf(name) ? firstNameOf(name) : "friend"}
            trade={trade.trim()}
            seeded={profileSeeded}
          />
        ) : null}

        {beat === "blade" && !skipping ? <BladeCard /> : null}

        {beat === "road" && lineIdx >= 1 && !skipping ? <RoadCard /> : null}
      </div>

      <div className="tavern-onb-foot">
        <div className="tavern-onb-dots" aria-hidden="true">
          {BEATS.map((b) => (
            <span
              key={b}
              className={`tavern-onb-dot${
                BEATS.indexOf(b) <= BEATS.indexOf(beat) ? " is-lit" : ""
              }`}
            />
          ))}
        </div>
        {beat === "handoff" && atLastLine ? (
          <button
            type="button"
            className="tavern-gate-btn tavern-onb-cta"
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
            {atLastLine ? "Next ▸" : "▸"}
          </button>
        )}
      </div>
    </div>
  );
}
