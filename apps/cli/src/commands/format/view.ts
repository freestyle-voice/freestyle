import { apiGet } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";
import { formatKeyValue } from "../../lib/table.js";

interface FormatRow {
  id: number;
  app_pattern: string;
  label: string;
  instructions: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export const formatViewCommand = buildCommand<FormatRow>({
  docs: { brief: "View a formatting rule" },
  parameters: {
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Format rule ID",
          parse: String,
        },
      ],
    },
  },
  output: {
    human: (data) =>
      formatKeyValue([
        ["ID", String(data.id)],
        ["Label", data.label],
        ["Pattern", data.app_pattern],
        ["Instructions", data.instructions],
        ["Type", data.is_default === 1 ? "default" : "custom"],
        ["Created", data.created_at],
        ["Updated", data.updated_at],
      ]),
    json: (data) => data,
  },
  async *func(flags, id) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);

    const row = await apiGet<FormatRow>(
      { baseUrl: base, port },
      `/api/formats/${id}`,
    );

    yield new CommandOutput(row);
  },
});
