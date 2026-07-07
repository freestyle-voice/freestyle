/**
 * Tone-feature benchmark.
 *
 * Exercises the destination + tone path of `buildRewritePrompt` against
 * gpt-oss-20b on Groq. Writes one JSON file per mode under
 * /tmp/freestyle-tone-bench/runs/<timestamp>/<mode>.json, then prints a
 * pass/fail summary.
 *
 * Usage:
 *   FREESTYLE_DB_PATH=/tmp/freestyle-tone-bench/db.sqlite \
 *     tsx scripts/tone-benchmark.ts --mode=personal
 *   FREESTYLE_DB_PATH=/tmp/freestyle-tone-bench/db.sqlite \
 *     tsx scripts/tone-benchmark.ts --mode=all
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateText } from "ai";

import { maxOutputTokensForCleanup } from "../src/lib/editor/max-output-tokens.ts";
import { sanitizeTranscriptText } from "../src/lib/editor/model-hints.ts";
import { buildRewritePrompt } from "../src/lib/editor/prompts.ts";
import { getGroqChatModel } from "../src/lib/groq-http.ts";
import { groqCleanupProviderOptions } from "../src/lib/post-process.ts";

const MODEL_ID = "openai/gpt-oss-20b";
const INTENSITY = "low" as const;

type Tone = "polished" | "casual" | "very_casual";
type WorkTone = "direct" | "friendly" | "formal";
type EmailTone = "casual" | "warm" | "formal";

export interface ToneCase {
  id: string;
  label: string;
  input: string;
  expected: string;
  /** Optional structural check: lines that must appear in the output. */
  mustInclude?: RegExp[];
  /** Optional structural check: patterns that must NOT appear. */
  mustExclude?: RegExp[];
  /** Optional tone-specific assertion. */
  toneAssert?: (output: string) => string | null;
}

export const PERSONAL_CASES: ToneCase[] = [
  {
    id: "personal-01",
    label: "Quick errand",
    input: "yo can u pick up milk on ur way home",
    expected: "Can you pick up milk on your way home?",
  },
  {
    id: "personal-02",
    label: "Warm follow-up",
    input:
      "hey it was really good to see you today we should do this more often",
    expected:
      "Hey, it was really good to see you today. We should do this more often.",
  },
  {
    id: "personal-03",
    label: "Travel update",
    input: "just got home safe the train was super delayed tho",
    expected: "Just got home safe. The train was super delayed though.",
  },
  {
    id: "personal-04",
    label: "Dinner plan",
    input: "wanna grab dinner tomorrow night",
    expected: "Want to grab dinner tomorrow night?",
  },
  {
    id: "personal-05",
    label: "Viral link",
    input: "did you see that thing i sent you earlier lmao",
    expected: "Did you see that thing I sent you earlier? LOL.",
  },
  {
    id: "personal-06",
    label: "Birthday",
    input: "happy birthday hope you have an amazing day",
    expected: "Happy birthday! Hope you have an amazing day.",
  },
  {
    id: "personal-07",
    label: "Running late",
    input: "i'm running like 10 mins late start without me",
    expected: "I'm running like 10 minutes late. Start without me.",
  },
  {
    id: "personal-08",
    label: "After-gathering",
    input: "thanks for having me over last night i had a great time",
    expected: "Thanks for having me over last night. I had a great time.",
  },
  {
    id: "personal-09",
    label: "Surprise reaction",
    input: "omg i can't believe that's actually happening",
    expected: "OMG, I can't believe that's actually happening!",
  },
  {
    id: "personal-10",
    label: "Weekend plans",
    input: "what are you up to this weekend",
    expected: "What are you up to this weekend?",
  },
];

export const WORK_CASES: ToneCase[] = [
  {
    id: "work-01",
    label: "PR review ask",
    input: "hey can you take a look at the PR when you get a chance",
    expected: "Hey, can you take a look at the PR when you get a chance?",
  },
  {
    id: "work-02",
    label: "Deploy status",
    input: "the deploy failed again i'm going to roll it back",
    expected: "The deploy failed again. I'm going to roll it back.",
  },
  {
    id: "work-03",
    label: "Sync request",
    input: "let's sync up about the roadmap later today",
    expected: "Let's sync up about the roadmap later today.",
  },
  {
    id: "work-04",
    label: "Deadline commit",
    input: "i'll have the design ready by eod tomorrow",
    expected: "I'll have the design ready by EOD tomorrow.",
  },
  {
    id: "work-05",
    label: "Meeting reschedule",
    input: "can we move the standup to 10 instead of 9",
    expected: "Can we move the standup to 10 instead of 9?",
  },
  {
    id: "work-06",
    label: "Client update ask",
    input: "the client is asking for an update on the project",
    expected: "The client is asking for an update on the project.",
  },
  {
    id: "work-07",
    label: "Bug report",
    input: "i think there's a bug in the checkout flow",
    expected: "I think there's a bug in the checkout flow.",
  },
  {
    id: "work-08",
    label: "Thanks",
    input: "thanks for jumping on that so quickly",
    expected: "Thanks for jumping on that so quickly.",
  },
  {
    id: "work-09",
    label: "Offer help",
    input: "let me know if you need anything else from me on this",
    expected: "Let me know if you need anything else from me on this.",
  },
  {
    id: "work-10",
    label: "Confirm meeting",
    input: "are we still good for the meeting on thursday",
    expected: "Are we still good for the meeting on Thursday?",
  },
];

export const EMAIL_CASES: ToneCase[] = [
  {
    id: "email-01",
    label: "Touch base",
    input:
      "hey sean just wondering if we can touch base sometime later this week thanks",
    expected:
      "Hey Sean,\n\nJust wondering if we can touch base sometime later this week.\n\nThanks,",
  },
  {
    id: "email-02",
    label: "Proposal follow-up",
    input:
      "hi sarah i wanted to follow up on the proposal we discussed last week let me know your thoughts",
    expected:
      "Hi Sarah,\n\nI wanted to follow up on the proposal we discussed last week. Let me know your thoughts.\n\nThanks,",
  },
  {
    id: "email-03",
    label: "Job inquiry",
    input:
      "hello i'm writing to inquire about the open position on your engineering team",
    expected:
      "Hello,\n\nI'm writing to inquire about the open position on your engineering team.\n\nThank you,",
  },
  {
    id: "email-04",
    label: "Deck review",
    input:
      "hi team attaching the updated deck for tomorrow's review please share feedback by end of day",
    expected:
      "Hi team,\n\nAttaching the updated deck for tomorrow's review. Please share feedback by end of day.\n\nThanks,",
  },
  {
    id: "email-05",
    label: "Application",
    input:
      "dear hiring manager please find my resume attached for the senior role",
    expected:
      "Dear Hiring Manager,\n\nPlease find my resume attached for the senior role.\n\nThank you,",
  },
  {
    id: "email-06",
    label: "Docs receipt",
    input:
      "hey alex thanks for sending those docs over i'll review them and get back to you tomorrow",
    expected:
      "Hey Alex,\n\nThanks for sending those docs over. I'll review them and get back to you tomorrow.\n\nThanks,",
  },
  {
    id: "email-07",
    label: "Confirm call",
    input: "hi just wanted to confirm our call is still on for 3pm today",
    expected:
      "Hi,\n\nJust wanted to confirm our call is still on for 3pm today.\n\nThanks,",
  },
  {
    id: "email-08",
    label: "Support ticket",
    input: "good morning i'd like to request a follow up on ticket 4512",
    expected:
      "Good morning,\n\nI'd like to request a follow-up on ticket 4512.\n\nThank you,",
  },
  {
    id: "email-09",
    label: "Conference meet",
    input:
      "hi mark it was great meeting you at the conference let's stay in touch",
    expected:
      "Hi Mark,\n\nIt was great meeting you at the conference. Let's stay in touch.\n\nBest,",
  },
  {
    id: "email-10",
    label: "Partnership",
    input:
      "hello i hope this finds you well i'm reaching out regarding the partnership opportunity",
    expected:
      "Hello,\n\nI hope this finds you well. I'm reaching out regarding the partnership opportunity.\n\nThank you,",
  },
];

const ALL_CASES: Record<string, ToneCase[]> = {
  personal: PERSONAL_CASES,
  work: WORK_CASES,
  email: EMAIL_CASES,
};

const TONE_OPTIONS: Record<string, readonly string[]> = {
  personal: ["polished", "casual", "very_casual"],
  work: ["direct", "friendly", "formal"],
  email: ["casual", "warm", "formal"],
};

interface RunResult {
  id: string;
  label: string;
  tone: string;
  input: string;
  output: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  structuralOk: boolean;
  structuralErrors: string[];
}

function checkStructural(
  mode: string,
  tone: string,
  output: string,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const trimmed = output.trim();
  if (!trimmed) {
    errors.push("empty output");
    return { ok: false, errors };
  }

  if (mode === "email") {
    // Email body must have greeting on its own line + body block(s).
    // Sign-off is optional (per prompt: do not invent a sign-off that wasn't spoken),
    // but if present it must be on its own line.
    const blocks = trimmed
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter(Boolean);
    if (blocks.length < 2) {
      errors.push(
        "email body must contain greeting and at least one body block",
      );
    } else {
      const greeting = blocks[0]!;
      // A greeting block is a single line, starts with a capital letter, ends with a comma, and is short (<= 60 chars)
      if (
        greeting.split("\n").length !== 1 ||
        !/^[A-Za-z]/.test(greeting) ||
        !/[,]$/.test(greeting) ||
        greeting.length > 60
      ) {
        errors.push(
          `first block should be a greeting on its own line ending with a comma, got: ${JSON.stringify(greeting)}`,
        );
      }
      // If there are 3+ blocks, the last one is likely a sign-off; verify it's a single short line
      if (blocks.length >= 3) {
        const last = blocks.at(-1) ?? "";
        if (last.split("\n").length !== 1 || last.length > 60) {
          errors.push(
            `last block should be a sign-off on its own line, got: ${JSON.stringify(last)}`,
          );
        }
      }
    }
  }

  if (mode === "personal" && tone === "very_casual") {
    // Should feel like Discord chat: minimal punctuation, lowercase-y
    const periods = (trimmed.match(/\./g) ?? []).length;
    const questionMarks = (trimmed.match(/\?/g) ?? []).length;
    if (periods > 2 || questionMarks > 1) {
      errors.push(
        `very_casual has too much sentence-ending punctuation (periods=${periods}, ?=${questionMarks})`,
      );
    }
  }

  if (mode === "personal" && tone === "polished") {
    // Should have proper sentence capitalization + at least some terminal punctuation
    const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
    const uncapd = sentences.filter((s) => /^[a-z]/.test(s)).length;
    if (uncapd > 0) {
      errors.push(`polished has ${uncapd} sentence(s) starting lowercase`);
    }
  }

  return { ok: errors.length === 0, errors };
}

async function runCase(
  mode: string,
  tone: string,
  testCase: ToneCase,
): Promise<RunResult> {
  const started = Date.now();
  const { system, prompt } = buildRewritePrompt(testCase.input, {
    intensity: INTENSITY,
    destination: mode as "personal" | "work" | "email",
    personalTone: mode === "personal" ? (tone as Tone) : undefined,
    workTone: mode === "work" ? (tone as WorkTone) : undefined,
    emailTone: mode === "email" ? (tone as EmailTone) : undefined,
  });
  const model = getGroqChatModel(MODEL_ID);
  const result = await generateText({
    model,
    system,
    prompt,
    temperature: 0,
    maxOutputTokens: maxOutputTokensForCleanup(testCase.input),
    providerOptions: groqCleanupProviderOptions(MODEL_ID),
  });
  const output = sanitizeTranscriptText(result.text);
  const { ok, errors } = checkStructural(mode, tone, output);
  return {
    id: testCase.id,
    label: testCase.label,
    tone,
    input: testCase.input,
    output,
    latencyMs: Date.now() - started,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    structuralOk: ok,
    structuralErrors: errors,
  };
}

function parseArgs(argv: string[]): { mode: string } {
  const arg = argv.find((a) => a.startsWith("--mode="));
  return { mode: arg ? arg.split("=")[1]! : "all" };
}

async function main() {
  const { mode } = parseArgs(process.argv.slice(2));
  const modes = mode === "all" ? ["personal", "work", "email"] : [mode];
  const runDir = resolve(
    "/tmp/freestyle-tone-bench/runs",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  await mkdir(runDir, { recursive: true });

  const summary: Record<
    string,
    { total: number; structuralOk: number; results: RunResult[] }
  > = {};

  for (const currentMode of modes) {
    const cases = ALL_CASES[currentMode]!;
    const tones = TONE_OPTIONS[currentMode]!;
    const results: RunResult[] = [];
    for (const tone of tones) {
      console.log(`\n=== ${currentMode} / ${tone} ===`);
      for (const testCase of cases) {
        try {
          const result = await runCase(currentMode, tone, testCase);
          results.push(result);
          const verdict = result.structuralOk ? "OK" : "STRUCT";
          console.log(
            `  [${tone.padEnd(11)}] ${testCase.id} :: ${verdict} (${result.latencyMs}ms in=${result.inputTokens} out=${result.outputTokens})`,
          );
          if (!result.structuralOk) {
            for (const err of result.structuralErrors) {
              console.log(`    ! ${err}`);
            }
          }
        } catch (err) {
          console.log(
            `  [${tone.padEnd(11)}] ${testCase.id} :: ERROR ${err instanceof Error ? err.message : err}`,
          );
          results.push({
            id: testCase.id,
            label: testCase.label,
            tone,
            input: testCase.input,
            output: "",
            latencyMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            structuralOk: false,
            structuralErrors: [
              `runtime error: ${err instanceof Error ? err.message : String(err)}`,
            ],
          });
        }
      }
    }
    summary[currentMode] = {
      total: results.length,
      structuralOk: results.filter((r) => r.structuralOk).length,
      results,
    };
    await writeFile(
      resolve(runDir, `${currentMode}.json`),
      JSON.stringify({ mode: currentMode, results }, null, 2),
    );
  }

  console.log("\n--- Summary ---");
  for (const [m, s] of Object.entries(summary)) {
    console.log(
      `${m}: ${s.structuralOk}/${s.total} structural-pass (across ${TONE_OPTIONS[m]!.length} tones)`,
    );
  }
  console.log(`\nRun dir: ${runDir}`);
}

void main();
