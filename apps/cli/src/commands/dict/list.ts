import chalk from "chalk";
import { apiGet } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";
import { formatTable } from "../../lib/table.js";

interface DictionaryRow {
  id: number;
  key: string;
  value: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface DictListResponse {
  items: DictionaryRow[];
  total: number;
  limit: number;
  offset: number;
}

export const dictListCommand = buildCommand<DictListResponse>({
  docs: { brief: "List dictionary entries" },
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
        brief: "Search by key or value",
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
        `Showing ${String(data.items.length)} of ${String(data.total)} dictionary entries`,
      );
      const table = formatTable(data.items as any, [
        { key: "id", label: "ID", width: 6 },
        { key: "key", label: "Key", width: 25 },
        { key: "value", label: "Value", width: 30 },
        {
          key: "usage_count",
          label: "Uses",
          width: 8,
          transform: (v) => String(v),
        },
        { key: "created_at", label: "Created", width: 20 },
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

    const data = await apiGet<DictListResponse>(
      { baseUrl: base, port },
      `/api/dictionary?${params.toString()}`,
    );

    yield new CommandOutput(data);
  },
});
