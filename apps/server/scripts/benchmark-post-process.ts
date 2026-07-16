import {
  maxOutputTokensForCleanup,
  sanitizeTranscriptText,
} from "@freestyle-voice/stt";
import { generateText } from "ai";
import { buildRewritePrompt } from "../src/lib/editor/prompts.ts";
import { getGroqChatModel } from "../src/lib/groq-http.ts";
import { groqCleanupProviderOptions } from "../src/lib/llm/registry.ts";
import {
  type BenchmarkCase,
  POST_PROCESS_BENCHMARK_CASES,
} from "./post-process-benchmark-cases.ts";

type PromptVariant = "baseline" | "dynamic-language";
type BenchmarkSuite = "quick" | "full";

interface BenchmarkResult {
  modelId: string;
  variant: PromptVariant;
  passed: number;
  total: number;
  byLanguage: Record<string, { passed: number; total: number }>;
  cases: Array<{
    id: string;
    language: string;
    expected: string;
    actual: string;
    ok: boolean;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

const MODELS = [
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
] as const;

const QUICK_CASE_PREFIXES = [
  "date-correction",
  "recipient-correction",
  "dictated-list",
  "superseded-plan",
] as const;

function normalizeForCompare(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function containsAll(text: string, patterns: RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(text));
}

function containsNone(text: string, patterns: RegExp[]): boolean {
  return patterns.every((pattern) => !pattern.test(text));
}

function evaluateCase(testCase: BenchmarkCase, actual: string): boolean {
  const normalized = normalizeForCompare(actual);

  if (testCase.id.startsWith("date-correction")) {
    if (testCase.language === "en") {
      return (
        containsAll(normalized, [/friday/i, /\bthree\b/i]) &&
        containsNone(normalized, [/thursday/i])
      );
    }
    if (testCase.language === "es") {
      return (
        containsAll(normalized, [/viernes/i, /tres/i]) &&
        containsNone(normalized, [/jueves/i])
      );
    }
    return (
      containsAll(normalized, [/周五/, /三点/]) &&
      containsNone(normalized, [/周四/])
    );
  }

  if (testCase.id.startsWith("recipient-correction")) {
    if (testCase.language === "en") {
      return (
        containsAll(normalized, [/legal/i]) &&
        containsNone(normalized, [/marketing/i])
      );
    }
    if (testCase.language === "es") {
      return (
        containsAll(normalized, [/legal/i]) &&
        containsNone(normalized, [/marketing/i])
      );
    }
    return (
      containsAll(normalized, [/法务/]) && containsNone(normalized, [/市场部/])
    );
  }

  if (testCase.id.startsWith("dictated-list")) {
    if (testCase.language === "en") {
      return containsAll(normalized, [
        /^here'?s what i need by end of week:/i,
        /1\./,
        /2\./,
        /3\./,
        /sam/i,
        /design/i,
        /finance/i,
      ]);
    }
    if (testCase.language === "es") {
      return containsAll(normalized, [
        /^esto es lo que necesito para fin de semana:/i,
        /1\./,
        /2\./,
        /3\./,
        /sam/i,
        /diseno/i,
        /finanzas/i,
      ]);
    }
    return containsAll(normalized, [
      /^这是我(?:在)?周末前需要的[:：]/,
      /1[.．、]/,
      /2[.．、]/,
      /3[.．、]/,
      /Sam/i,
      /设计/,
      /财务/,
    ]);
  }

  if (testCase.id.startsWith("superseded-plan")) {
    if (testCase.language === "en") {
      return (
        containsAll(normalized, [/zoom/i]) &&
        containsNone(normalized, [/san francisco/i, /oakland/i])
      );
    }
    if (testCase.language === "es") {
      return (
        containsAll(normalized, [/zoom/i]) &&
        containsNone(normalized, [/san francisco/i, /oakland/i])
      );
    }
    return (
      containsAll(normalized, [/Zoom/i]) &&
      containsNone(normalized, [/旧金山/, /奥克兰/])
    );
  }

  return normalizeForCompare(testCase.expected) === normalized;
}

function buildBenchmarkPrompt(
  input: string,
  language: BenchmarkCase["language"],
  variant: PromptVariant,
): { system: string; prompt: string } {
  const base = buildRewritePrompt(input);
  if (variant === "baseline") return base;
  return buildRewritePrompt(input, { language });
}

async function runCase(
  modelId: string,
  variant: PromptVariant,
  testCase: BenchmarkCase,
) {
  const started = Date.now();
  const model = getGroqChatModel(modelId);
  const { system, prompt } = buildBenchmarkPrompt(
    testCase.input,
    testCase.language,
    variant,
  );
  const result = await generateText({
    model,
    system,
    prompt,
    temperature: 0,
    maxOutputTokens: maxOutputTokensForCleanup(testCase.input),
    providerOptions: groqCleanupProviderOptions(modelId),
  });

  const actual = sanitizeTranscriptText(result.text);
  return {
    actual,
    ok: normalizeForCompare(actual) === normalizeForCompare(testCase.expected),
    latencyMs: Date.now() - started,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
  };
}

function parseCsvArg(name: string): string[] | null {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) return null;
  return (
    arg
      .split("=")[1]
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? null
  );
}

async function runBenchmarkSuite(
  variant: PromptVariant,
  suite: BenchmarkSuite,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const selectedModels = parseCsvArg("models") ?? [...MODELS];
  const requestedLanguages = new Set(parseCsvArg("languages") ?? []);
  const selectedCases =
    suite === "quick"
      ? POST_PROCESS_BENCHMARK_CASES.filter((testCase) =>
          QUICK_CASE_PREFIXES.some((prefix) => testCase.id.startsWith(prefix)),
        )
      : POST_PROCESS_BENCHMARK_CASES;
  const filteredCases =
    requestedLanguages.size > 0
      ? selectedCases.filter((testCase) =>
          requestedLanguages.has(testCase.language),
        )
      : selectedCases;

  for (const modelId of selectedModels) {
    const byLanguage: BenchmarkResult["byLanguage"] = {};
    const cases: BenchmarkResult["cases"] = [];
    let passed = 0;

    for (const testCase of filteredCases) {
      const outcome = await runCase(modelId, variant, testCase);
      const ok = evaluateCase(testCase, outcome.actual);
      if (!byLanguage[testCase.language]) {
        byLanguage[testCase.language] = { passed: 0, total: 0 };
      }
      byLanguage[testCase.language].total += 1;
      if (ok) {
        passed += 1;
        byLanguage[testCase.language].passed += 1;
      }
      cases.push({
        id: testCase.id,
        language: testCase.language,
        expected: testCase.expected,
        actual: outcome.actual,
        ok,
        latencyMs: outcome.latencyMs,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      });
      console.log(
        `[${variant}/${suite}] ${modelId} :: ${testCase.id} :: ${ok ? "PASS" : "FAIL"} (${outcome.latencyMs}ms, in=${outcome.inputTokens}, out=${outcome.outputTokens})`,
      );
      if (!ok) {
        console.log(`  expected: ${JSON.stringify(testCase.expected)}`);
        console.log(`  actual:   ${JSON.stringify(outcome.actual)}`);
      }
    }

    results.push({
      modelId,
      variant,
      passed,
      total: filteredCases.length,
      byLanguage,
      cases,
    });
  }

  return results;
}

function printSummary(results: BenchmarkResult[]): void {
  console.log("\nSummary");
  for (const result of results) {
    const byLang = Object.entries(result.byLanguage)
      .map(([lang, stats]) => `${lang} ${stats.passed}/${stats.total}`)
      .join(" | ");
    console.log(
      `${result.variant} :: ${result.modelId} => ${result.passed}/${result.total} (${byLang})`,
    );
  }
}

async function main() {
  const variantArg = process.argv.find((arg) => arg.startsWith("--variant="));
  const suiteArg = process.argv.find((arg) => arg.startsWith("--suite="));
  const variant =
    (variantArg?.split("=")[1] as PromptVariant | undefined) ?? "baseline";
  const suite =
    (suiteArg?.split("=")[1] as BenchmarkSuite | undefined) ?? "quick";

  if (variant !== "baseline" && variant !== "dynamic-language") {
    throw new Error(`Unsupported variant: ${variant}`);
  }
  if (suite !== "quick" && suite !== "full") {
    throw new Error(`Unsupported suite: ${suite}`);
  }

  const results = await runBenchmarkSuite(variant, suite);
  printSummary(results);
}

void main();
