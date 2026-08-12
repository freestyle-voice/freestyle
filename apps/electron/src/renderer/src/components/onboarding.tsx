import { apiFetch } from "@renderer/lib/api";
import { readBrainFile, writeBrainFile } from "@renderer/lib/brain-fs";
import {
  BEATS,
  type BeatId,
  beatLines,
  EASTER_EGGS,
  firstNameOf,
  handoffCta,
  jobPlaceholder,
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

/** The list beat's real write: the user's own sentence onto their own list. */
async function seedTodo(quest: string): Promise<void> {
  const todos = await readBrainFile("todos.md");
  if (todos?.includes(quest)) return;
  const base = todos?.trimEnd() ? `${todos.trimEnd()}\n` : "";
  await writeBrainFile("todos.md", `${base}- [ ] ${quest}\n`);
}

/** The brain beat's real write: the profile page plus its index line. */
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

/* Pixel-accurate miniatures of the real tabs — onboarding doubles as a map
   of the product, so these echo the panel's own patterns, not new ones. */

function MiniTabs({ active }: { active: string }): React.JSX.Element {
  return (
    <div className="tavern-onb-mtabs">
      {["Chat", "History", "Todos", "Notes"].map((tab) => (
        <span
          key={tab}
          className={`tavern-onb-mtab${tab === active ? " is-on" : ""}`}
        >
          {tab}
        </span>
      ))}
    </div>
  );
}

function MiniTodos({
  quest,
  seeded,
}: {
  quest: string;
  seeded: boolean;
}): React.JSX.Element {
  return (
    <div className="tavern-onb-mini">
      <MiniTabs active="Todos" />
      <div className="tavern-onb-mbody">
        {seeded ? (
          <div className="tavern-onb-mtodo">
            <span className="tavern-onb-mcheck" />
            <span className="tavern-onb-mtodo-main">{quest}</span>
          </div>
        ) : (
          <span className="tavern-onb-writing">writing…</span>
        )}
        <div className="tavern-onb-mtodo is-done">
          <span className="tavern-onb-mcheck is-on" />
          <span>Meet Jeb</span>
        </div>
      </div>
    </div>
  );
}

function MiniNotes({
  name,
  trade,
  seeded,
}: {
  name: string;
  trade: string;
  seeded: boolean;
}): React.JSX.Element {
  return (
    <div className="tavern-onb-mini">
      <MiniTabs active="Notes" />
      <div className="tavern-onb-mbody">
        <div className="tavern-onb-mnote">
          <b>Profile</b>
          {seeded ? (
            <i>
              {name}
              {trade ? ` — ${trade.toLowerCase()}` : ""}. Captured during
              onboarding.
            </i>
          ) : (
            <i className="tavern-onb-writing">writing…</i>
          )}
        </div>
        <div className="tavern-onb-mnote is-dim">
          <b>Notes</b>
          <i>anything worth keeping lands here</i>
        </div>
        <div className="tavern-onb-mnote is-dim">
          <b>Skills</b>
          <i>teach me once, I do it your way every time</i>
        </div>
      </div>
    </div>
  );
}

function MiniApproval(): React.JSX.Element {
  return (
    <div className="tavern-onb-mini">
      <MiniTabs active="Chat" />
      <div className="tavern-onb-mbody">
        <div className="tavern-onb-muser">What ended the Edo period?</div>
        <div className="tavern-onb-mtool">
          <i>◆</i> read your screen ▸
        </div>
        <div className="tavern-onb-mappr">
          <span className="tavern-onb-mappr-t">
            jeb wants to type at your cursor
          </span>
          <span>“The Meiji Restoration — 1868.”</span>
          <span className="tavern-onb-mabtn">
            <span className="is-go">Allow</span>
            <span>Don't allow</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniSearch(): React.JSX.Element {
  return (
    <div className="tavern-onb-mini">
      <MiniTabs active="Chat" />
      <div className="tavern-onb-mbody">
        <div className="tavern-onb-muser">Latest news in Austin?</div>
        <div className="tavern-onb-mtool">
          <i>◆</i> searched the web ▸
        </div>
        <span>
          “City breaks ground on new transit line.”{" "}
          <i className="tavern-onb-msrc">Austin Chronicle, this morning.</i>
        </span>
      </div>
    </div>
  );
}

function DeskMiniature({
  spriteForm,
}: {
  spriteForm: SpriteId;
}): React.JSX.Element {
  return (
    <div className="tavern-onb-desk">
      <div className="tavern-onb-deskwin">
        <i />
      </div>
      <div className="tavern-onb-deskjeb">
        <SpriteBadge form={spriteForm} size={64} />
      </div>
      <span className="tavern-onb-deskhome">← home</span>
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

  // Welcome flourish from the real corner sprite.
  useEffect(() => {
    if (beat === "welcome") {
      window.api.spriteEvent({ kind: "emote", emotion: "proud" });
    }
  }, [beat]);

  // The list beat: the user's sentence lands on their real list while Jeb
  // types. Reads the entry render's closure and keys on the beat alone —
  // re-running on render identities would clear the timer behind the guard.
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

  // The brain beat: the profile page is written for real, plus the prefill.
  // biome-ignore lint/correctness/useExhaustiveDependencies: same contract as the list beat
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

  // The corner beat: the real sprite makes the trip home while the stage
  // shows the desktop miniature.
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
    }, 400);
    window.setTimeout(() => {
      window.api.spriteEvent({
        kind: "travel",
        phase: "end",
        travelKind: "dash",
        direction: "left",
      });
      window.api.spriteEvent({ kind: "emote", emotion: "proud" });
    }, 1300);
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
  // advances the beat — including the handoff CTA. Buttons keep their native
  // Enter activation (handling it here too would double-fire), and the
  // gating lives in advance()/beatDone, so a blocked beat just holds.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Enter" || e.isComposing || skipping) return;
      if ((e.target as HTMLElement | null)?.tagName === "BUTTON") return;
      e.preventDefault();
      if (beat === "handoff" && atLastLine && !typing) {
        complete();
        return;
      }
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skipping, beat, atLastLine, typing, complete, advance]);

  const inputReady = atLastLine && !typing && !skipping;

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
        {beat === "welcome" ? (
          <>
            <div className="tavern-onb-bigq">
              Someone's at
              <br />
              the <i>door.</i>
            </div>
            <p className="tavern-onb-sub">
              A ronin has moved into the corner of your screen. He'd like a word
              before you put him to work.
            </p>
          </>
        ) : null}

        {beat === "name" && inputReady ? (
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

        {beat === "job" && inputReady ? (
          <>
            <div className="tavern-onb-bigq">
              One thing you
              <br />
              need <i>done.</i>
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

        {beat === "list" && !skipping ? (
          <MiniTodos quest={questFor(task)} seeded={todoSeeded} />
        ) : null}

        {beat === "ledger" && !skipping ? (
          <MiniNotes
            name={firstNameOf(name) || "friend"}
            trade={trade.trim()}
            seeded={profileSeeded}
          />
        ) : null}

        {beat === "blade" && !skipping ? <MiniApproval /> : null}

        {beat === "road" && !skipping ? <MiniSearch /> : null}

        {beat === "corner" && !skipping ? (
          <DeskMiniature spriteForm={spriteForm} />
        ) : null}

        {beat === "handoff" && !skipping ? (
          <>
            <div className="tavern-onb-bigq">
              No bowing,
              <br />
              thank the <i>gods.</i>
            </div>
            {task.trim() ? (
              <div className="tavern-onb-mini">
                <div className="tavern-onb-mbody">
                  <div className="tavern-onb-mtodo">
                    <span className="tavern-onb-mcheck" />
                    <span className="tavern-onb-mtodo-main">
                      {questFor(task)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
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
      </div>

      <div className="tavern-onb-foot2">
        <span />
        {beat === "handoff" && atLastLine ? (
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
            {atLastLine ? "Next ▸" : "▸"}
          </button>
        )}
      </div>
    </div>
  );
}
