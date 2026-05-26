import chalk from "chalk";
import { apiGet } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";
import { formatTable } from "../../lib/table.js";

interface HistoryRow {
  id: number;
  raw_text: string;
  cleaned_text: string | null;
  voice_provider: string;
  voice_model: string;
  llm_provider: string | null;
  llm_model: string | null;
  duration_ms: number;
  audio_duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

interface HistoryListResponse {
  items: HistoryRow[];
  total: number;
  limit: number;
  offset: number;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return `${str.slice(0, len - 1)}\u2026`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${String(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const historyListCommand = buildCommand<HistoryListResponse>({
  docs: { brief: "List transcription history" },
  parameters: {
    flags: {
      limit: {
        kind: "parsed",
        parse: Number,
        brief: "Maximum number of results",
        default: "20",
      },
      offset: {
        kind: "parsed",
        parse: Number,
        brief: "Offset for pagination",
        default: "0",
      },
      search: {
        kind: "parsed",
        parse: String,
        brief: "Search transcription text",
        optional: true,
        default: undefined,
      },
      "order-by": {
        kind: "parsed",
        parse: String,
        brief: "Order by column (prefix with - for DESC)",
        default: "-created_at",
      },
    },
  },
  output: {
    human: (data) => {
      const header = chalk.dim(
        `Showing ${String(data.items.length)} of ${String(data.total)} transcriptions`,
      );
      const table = formatTable(data.items as any, [
        { key: "id", label: "ID", width: 6 },
        {
          key: "cleaned_text",
          label: "Text",
          width: 40,
          transform: (v) => truncate((v as string) ?? "(no text)", 40),
        },
        { key: "voice_model", label: "Model", width: 20 },
        {
          key: "duration_ms",
          label: "Duration",
          width: 10,
          transform: (v) => formatDuration(v as number),
        },
        {
          key: "cost_usd",
          label: "Cost",
          width: 10,
          transform: (v) => `$${(v as number).toFixed(4)}`,
        },
        { key: "created_at", label: "Date", width: 20 },
      ]);
      return `${header}\n${table}`;
    },
    json: (data) => data,
  },
  async *func(flags) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);
    const params = new URLSearchParams({
      limit: String(flags.limit),
      offset: String(flags.offset),
      orderBy: flags["order-by"],
    });
    if (flags.search) params.set("search", flags.search);

    const data = await apiGet<HistoryListResponse>(
      { baseUrl: base, port },
      `/api/history?${params.toString()}`,
    );

    yield new CommandOutput(data);
  },
});
