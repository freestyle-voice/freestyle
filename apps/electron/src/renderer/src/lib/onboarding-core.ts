export const ONBOARDING_KEY = "onboarding";
export const DEFAULT_QUEST = "Ask Jeb to do something for you";
export const PROFILE_PATH = "memories/profile.md";
export const PROFILE_INDEX_LINE = `- ${PROFILE_PATH} — who the user is`;
export const QUEST_MAX_CHARS = 120;

export const SKIP_LINE = "Fine. I'll learn you the slow way.";

export const EASTER_EGGS = [
  "Something on my face?",
  "The armor's ceremonial. Mostly.",
  "Sixty-one duels. You'll ask eventually.",
  "I lost two. I'm not saying which.",
  "Keep poking and I'll start a ledger on that too.",
] as const;

/** The hero workflows, in showcase order — only shown when no task was given. */
export function starterPrompts(): string[] {
  return [
    "Summarize what's on my screen",
    "Rewrite what I'm looking at",
    "Look this up and keep it short",
  ];
}

export const BEATS = [
  "welcome",
  "name",
  "trade",
  "job",
  "list",
  "ledger",
  "blade",
  "road",
  "corner",
  "handoff",
] as const;
export type BeatId = (typeof BEATS)[number];

/** Ordered by likely population — the panel renders as many as fit. */
export const TRADE_CHIPS = [
  "Engineer",
  "Designer",
  "Founder",
  "Product",
  "Writer",
  "Student",
  "Researcher",
  "Marketer",
  "Consultant",
  "Operations",
  "Sales",
  "Teacher",
  "Finance",
  "Healthcare",
  "Law",
  "Between things",
] as const;

const TRADE_REACTIONS: Record<string, string> = {
  Engineer:
    "A smith. You build the things everyone else swings around all day.",
  Designer:
    "You decide how a thing feels before anyone touches it. Closer to swordwork than you'd think.",
  Founder: "A daimyo with no army yet. I've served worse odds.",
  Product: "You pick which hill we take. Fine. I'll carry the map.",
  Writer:
    "Words. Careful with those. They cut both directions, and they don't stop when you do.",
  Student:
    "Training, then. Everyone's a student. Mine ran forty years and I still lost twice.",
  Researcher:
    "You chase the truth for a living. Slow work. Honest work. I like it.",
  Marketer: "You decide where the eyes go. Half of any battle is exactly that.",
  Consultant: "A hired blade. Ha. We'll get along.",
  Operations:
    "You keep the machine breathing while other people take the bow. Noted.",
  Sales: "You talk people into things. So did every general worth remembering.",
  Teacher:
    "You sharpen other people. Better job than mine. Nobody writes songs about it.",
  Finance:
    "You count what's real. Somebody has to, or the camp starves by spring.",
  Healthcare:
    "You put people back together. I only ever did the other thing. Respect.",
  Law: "Rules as weapons. Grim discipline. Still a discipline.",
  "Between things":
    "Between things. So was I, for eleven years. It ends. Sit down.",
};

/** The Job's hint, tuned to the trade they just picked. */
const JOB_HINTS: Record<string, string> = {
  Engineer:
    'Anything. "Fix the login bug." "Review Sam\'s PR." "Write the deploy script."',
  Designer:
    'Anything. "Finish the mockups." "Polish the onboarding flow." "Pick a font already."',
  Founder:
    'Anything. "Draft the investor update." "Chase the pilot customer." "Hire someone."',
  Product:
    'Anything. "Write the spec." "Groom the backlog." "Say no to something."',
  Writer: 'Anything. "Finish the draft." "Cut it by half." "Pitch the editor."',
  Student:
    'Anything. "Finish the problem set." "Start the essay." "Study for Thursday."',
  Researcher:
    'Anything. "Finish the lit review." "Clean the data." "Answer reviewer two."',
  Marketer:
    'Anything. "Ship the campaign." "Write the launch post." "Fix the landing page."',
  Consultant:
    'Anything. "Finish the deck." "Write up the findings." "Bill the hours."',
  Operations:
    'Anything. "Untangle the schedule." "Chase the vendor." "Fix the process doc."',
  Sales:
    'Anything. "Follow up with the lead." "Prep the demo." "Update the pipeline."',
  Teacher:
    'Anything. "Grade the essays." "Plan tomorrow\'s lesson." "Email the parents."',
  Finance:
    'Anything. "Close the month." "Fix the forecast." "Chase the invoices."',
  Healthcare:
    'Anything. "Finish the charting." "Prep for rounds." "Clear the inbox."',
  Law: 'Anything. "Review the contract." "Draft the memo." "Log the billables."',
  "Between things":
    'Anything. "Update the résumé." "Reply to the recruiter." "Figure out what\'s next."',
};

export function jobHint(trade: string): string {
  return (
    JOB_HINTS[trade.trim()] ??
    'Anything. "Finish the deck." "Reply to Sam." "Figure out my taxes."'
  );
}

export interface OnboardingSaved {
  v: 1;
  done: boolean;
  beat?: BeatId;
  name?: string;
  trade?: string;
  task?: string;
  /** A settings-triggered rerun — never seed a second thread from it. */
  replayed?: boolean;
}

export function parseSaved(value: string | undefined): OnboardingSaved | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as OnboardingSaved;
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function firstNameOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** The todos.md line — and its dedupe key. Trimmed and capped for markdown. */
export function questFor(task: string): string {
  const trimmed = task.trim().replace(/\s+/g, " ");
  if (!trimmed) return DEFAULT_QUEST;
  return trimmed.length > QUEST_MAX_CHARS
    ? `${trimmed.slice(0, QUEST_MAX_CHARS - 1)}…`
    : trimmed;
}

export function profileMarkdown(name: string, trade: string): string {
  const lines = ["# Profile", "", `- Name: ${name}`];
  if (trade) lines.push(`- Trade: ${trade}`);
  lines.push("", "Captured during onboarding.", "");
  return lines.join("\n");
}

export function nameReaction(
  typed: string,
  accountName: string | null | undefined,
): string {
  const name = typed.trim();
  const first = firstNameOf(name);
  if (accountName && name === accountName.trim()) {
    return `${first}. Already knew. Wanted to hear you say it.`;
  }
  if (name.length > 0 && name.length <= 2) {
    return `${first}. That's not a name, that's a grunt. I'll take it.`;
  }
  if (wordCount(name) >= 4) {
    return `All of that? I'll call you ${first} and we'll both save time.`;
  }
  return `${first}. Good name. Short enough to shout across a room.`;
}

export function tradeReaction(trade: string): string {
  const trimmed = trade.trim();
  if (!trimmed) {
    return "Nothing? Fine. I'll work out what you do by watching what you ask.";
  }
  return (
    TRADE_REACTIONS[trimmed] ??
    `"${trimmed}." Never heard of it. You'll teach me.`
  );
}

export function jobReaction(task: string): string {
  const trimmed = task.trim();
  if (!trimmed) {
    return "Nothing comes to mind? It will. It always does, usually at the worst hour.";
  }
  const words = wordCount(trimmed);
  if (words <= 3) return `"${trimmed}." Blunt. I like blunt.`;
  if (words >= 12) {
    return "That's not one thing, that's a campaign. Fine. We'll start at the front of it.";
  }
  return `Alright. "${trimmed}." That's a target. I've had vaguer orders from actual lords.`;
}

export interface BeatContext {
  name: string;
  trade: string;
  task: string;
  accountName?: string | null;
}

export interface BeatScene {
  lines: string[];
  hint?: string;
}

export function beatLines(beat: BeatId, ctx: BeatContext): BeatScene {
  const first = firstNameOf(ctx.name) || "friend";
  const task = ctx.task.trim();
  switch (beat) {
    case "welcome":
      return {
        lines: [
          "Ah. Someone's at the door.",
          "I'm Jeb. Wandering samurai, retired. Sixty-one duels, two regrets, and now this corner of your screen.",
        ],
      };
    case "name":
      return {
        lines: [
          "Before anything else, a name. I don't take work from strangers.",
        ],
        hint: "Whatever you'd actually answer to.",
      };
    case "trade":
      return {
        lines: [
          nameReaction(ctx.name, ctx.accountName),
          "And your trade? Every warrior has one. Mine was swords and dramatic staring. Yours probably pays better.",
        ],
      };
    case "job":
      return {
        lines: [
          tradeReaction(ctx.trade),
          "Now the useful part. What are you actually trying to get done today? One thing. The one that'll still be bothering you at supper.",
        ],
        hint: jobHint(ctx.trade),
      };
    case "list":
      return {
        lines: task
          ? [
              jobReaction(task),
              "First thing I did was put it on your todo list. I manage that list for you: I add things, break the big ones into steps, and check them off when they're done. And I read it before everything I say, so you'll never explain it twice.",
            ]
          : [
              jobReaction(task),
              "Here's your todo list, empty for now. I manage it for you: I add things, break the big ones into steps, and check them off when they're done. And I read it before everything I say, so you'll never explain it twice.",
            ],
      };
    case "ledger":
      return {
        lines: [
          `I also keep a brain, ${first}. Memories of who you are and what you're working on, so you never repeat yourself. Notes, for anything worth keeping. And skills: teach me how you do something once, and I'll do it your way every time. All yours to read, edit, or erase.`,
        ],
      };
    case "blade":
      return {
        lines: [
          "Stuck on something? Highlight it and just ask. A homework question, a gnarly email, whatever. I can read what's on your screen.",
          task
            ? `I can even type the answer right at your cursor, with your go-ahead. So when "${questFor(task)}" is on your screen, don't describe it. Just ask.`
            : "I can even type the answer right at your cursor, with your go-ahead. Don't describe your work to me. Put it on screen and ask.",
        ],
      };
    case "road":
      return {
        lines: [
          "And I learned how to use a computer. Impressive, I know. I search the web when I don't know something, and I tell you exactly where the answer came from.",
          "Try me later: ask for the latest news in your city. I'll have it before your tea cools.",
        ],
      };
    case "corner":
      return {
        lines: [
          "Last thing: I don't live in this window. Watch.",
          "That's home. I'll be down there while you work. Hover me whenever you need me. Ignore me until you don't.",
        ],
      };
    case "handoff":
      return {
        lines: task
          ? [
              "That's everything. No bowing, thank the gods.",
              `I've already opened a thread on "${questFor(task)}". Let's get it off your list.`,
            ]
          : [
              "That's everything. No bowing, thank the gods.",
              `I've been sharpening this thing for a week with nothing to cut, ${first}.`,
            ],
      };
  }
}

export function handoffCta(task: string): string {
  return task.trim() ? "Get it done ▸" : "Ride with Jeb ▸";
}

export function seedMessageFor(task: string): string {
  return `Help me get this done: ${questFor(task)}`;
}
