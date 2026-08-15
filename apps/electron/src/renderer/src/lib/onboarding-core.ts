import type { Industry } from "@freestyle-voice/validations";

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

/** Last-resort starters when the suggestions request fails. Every one must be
 * something the current tool set can actually do. */
export function starterPrompts(): string[] {
  return [
    "Look this up and keep it short",
    "Help me draft a message I've been putting off",
    "Remember something about how I work",
  ];
}

export const BEATS = [
  "name",
  "trade",
  "inbox",
  "compass",
  "goal",
  "receipt",
] as const;
export type BeatId = (typeof BEATS)[number];

/** Connect-beat rosters and the automations each connection unlocks. Slugs
 * and template ids mirror the cloud's SUGGESTED_TOOLKITS / AUTOMATION_TEMPLATES. */
export const ONBOARDING_EMAIL_APPS = ["gmail", "outlook"] as const;
export const ONBOARDING_CALENDAR_APPS = ["googlecalendar", "outlook"] as const;
export const EMAIL_TEMPLATE_IDS = [
  "morning-inbox-brief",
  "inbox-slip-watch",
  "friday-wrap",
] as const;
export const CALENDAR_TEMPLATE_IDS = [
  "plan-my-day",
  "meeting-prep-nudge",
] as const;

/** Trade chips mapped onto the Settings industry enum, so onboarding fills
 * the same profile field Settings edits. Chips with no honest industry
 * (Founder, Operations, "Between things") set none; the jobTitle fallback
 * covers them. */
export const TRADE_TO_INDUSTRY: Record<string, Industry> = {
  Engineer: "software",
  Designer: "design",
  Product: "software",
  Writer: "media",
  Student: "education",
  Researcher: "research",
  Marketer: "marketing",
  Consultant: "consulting",
  Sales: "sales",
  Teacher: "education",
  Finance: "finance",
  Healthcare: "healthcare",
  Law: "legal",
};

export const AUTOMATION_LABELS: Record<string, string> = {
  "morning-inbox-brief": "Morning inbox brief · weekdays 8am",
  "inbox-slip-watch": "Slip watch · weekdays 1pm",
  "friday-wrap": "Friday wrap · 4pm",
  "plan-my-day": "Plan my day · weekdays 7:30am",
  "meeting-prep-nudge": "Meeting prep nudges · before meetings",
};

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

/** The Job's placeholder examples, tuned to the trade they just picked. */
const JOB_EXAMPLES: Record<string, [string, string, string]> = {
  Engineer: ["Fix the login bug", "Review Sam's PR", "Write the deploy script"],
  Designer: [
    "Finish the mockups",
    "Polish the onboarding flow",
    "Pick a font already",
  ],
  Founder: [
    "Draft the investor update",
    "Chase the pilot customer",
    "Hire someone",
  ],
  Product: ["Write the spec", "Groom the backlog", "Say no to something"],
  Writer: ["Finish the draft", "Cut it by half", "Pitch the editor"],
  Student: ["Finish the problem set", "Start the essay", "Study for Thursday"],
  Researcher: [
    "Finish the lit review",
    "Clean the data",
    "Answer reviewer two",
  ],
  Marketer: [
    "Ship the campaign",
    "Write the launch post",
    "Fix the landing page",
  ],
  Consultant: ["Finish the deck", "Write up the findings", "Bill the hours"],
  Operations: [
    "Untangle the schedule",
    "Chase the vendor",
    "Fix the process doc",
  ],
  Sales: ["Follow up with the lead", "Prep the demo", "Update the pipeline"],
  Teacher: ["Grade the essays", "Plan tomorrow's lesson", "Email the parents"],
  Finance: ["Close the month", "Fix the forecast", "Chase the invoices"],
  Healthcare: ["Finish the charting", "Prep for rounds", "Clear the inbox"],
  Law: ["Review the contract", "Draft the memo", "Log the billables"],
  "Between things": [
    "Update the résumé",
    "Reply to the recruiter",
    "Figure out what's next",
  ],
};

export function jobPlaceholder(trade: string): string {
  const examples = JOB_EXAMPLES[trade.trim()] ?? [
    "Finish the deck",
    "Reply to Sam",
    "Figure out my taxes",
  ];
  return examples.join(" · ");
}

export interface OnboardingSaved {
  v: 2;
  done: boolean;
  beat?: BeatId;
  name?: string;
  trade?: string;
  task?: string;
  /** Toolkit slugs connected during the flow. */
  connected?: string[];
  /** Automation template ids created during the flow. */
  automations?: string[];
  /** A settings-triggered rerun — never seed a second thread from it. */
  replayed?: boolean;
}

export function parseSaved(value: string | undefined): OnboardingSaved | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      v?: number;
      done?: boolean;
      task?: string;
      replayed?: boolean;
    };
    if (!parsed) return null;
    if (parsed.v === 2) {
      const saved = parsed as OnboardingSaved;
      // A saved beat from a different flow version restarts cleanly.
      if (saved.beat && !BEATS.includes(saved.beat))
        return { ...saved, beat: undefined };
      return saved;
    }
    // v1 completions stay completed; a v1 mid-flow save restarts the new flow.
    if (parsed.v === 1 && parsed.done === true) {
      return {
        v: 2,
        done: true,
        ...(parsed.task ? { task: parsed.task } : {}),
        ...(parsed.replayed ? { replayed: true } : {}),
      };
    }
    return null;
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
  emailConnected?: boolean;
  calendarConnected?: boolean;
}

export interface BeatScene {
  lines: string[];
  hint?: string;
}

export function beatLines(beat: BeatId, ctx: BeatContext): BeatScene {
  const task = ctx.task.trim();
  switch (beat) {
    case "name":
      return {
        lines: [
          "I'm Jeb. Retired samurai, currently I live in the corner of your screen. My job is simple, to make sure nothing important slips past you.",
          "First, a name. I don't take work from strangers.",
        ],
        hint: "Whatever you'd actually answer to.",
      };
    case "trade":
      return {
        lines: [
          `${nameReaction(ctx.name, ctx.accountName)} And your trade? Mine was swords and dramatic staring.`,
        ],
      };
    case "inbox":
      return {
        lines: [
          "Now the real work. Hook up your mail and I'll stand watch. A daily brief of your inbox every weekday morning, and a reminder when something important is about to slip.",
        ],
        hint: "Your mail stays yours. I read; I never send.",
      };
    case "compass":
      return {
        lines: [
          ctx.emailConnected
            ? "Good. The inbox is watched. Calendar next: mornings I'll lay your day out, and before meetings I'll hand you what you need walking in."
            : "Suit yourself. Calendar then. Mornings I'll lay your day out, and before meetings I'll hand you what you need walking in.",
        ],
      };
    case "goal":
      return {
        lines: [
          ctx.calendarConnected ? "That's the watch set." : "Fair enough.",
          "Last thing. What's one thing you want done today or tomorrow? Just one.",
        ],
      };
    case "receipt":
      return {
        lines: [
          jobReaction(task),
          task
            ? "It's on your list and I've opened a thread on it. Here's the watch as it stands."
            : "Then we improvise. Here's the watch as it stands.",
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
