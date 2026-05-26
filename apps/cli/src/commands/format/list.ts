import chalk from "chalk";
import { apiGet } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";
import { formatTable } from "../../lib/table.js";

interface FormatRow {
  id: number;
  app_pattern: string;
  label: string;
  instructions: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface FormatListResponse {
  items: FormatRow[];
  total: number;
  limit: number;
  offset: number;
}

export const formatListCommand = buildCommand<FormatListResponse>({
  docs: { brief: "List formatting rules" },
  parameters: {
    flags: {
      limit: {
        kind: "parsed",
        parse: Number,
        brief: "Maximum number of results",
        default: "50",
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
        brief: "Search by label, pattern, or instructions",
        optional: true,
        default: undefined,
      },
    },
  },
  output: {
    human: (data) => {
      const header = chalk.dim(
        `Showing ${String(data.items.length)} of ${String(data.total)} format rules`,
      );
      const table = formatTable(data.items as any, [
        { key: "id", label: "ID", width: 6 },
        { key: "label", label: "Label", width: 20 },
        { key: "app_pattern", label: "Pattern", width: 30 },
        {
          key: "is_default",
          label: "Type",
          width: 10,
          transform: (v) => (v === 1 ? "default" : "custom"),
        },
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
    });
    if (flags.search) params.set("search", flags.search);

    const data = await apiGet<FormatListResponse>(
      { baseUrl: base, port },
      `/api/formats?${params.toString()}`,
    );

    yield new CommandOutput(data);
  },
});
