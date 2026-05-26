import { apiGet } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";
import { formatKeyValue } from "../../lib/table.js";

interface DictionaryRow {
  id: number;
  key: string;
  value: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export const dictViewCommand = buildCommand<DictionaryRow>({
  docs: { brief: "View a dictionary entry" },
  parameters: {
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Dictionary entry ID",
          parse: String,
        },
      ],
    },
  },
  output: {
    human: (data) =>
      formatKeyValue([
        ["ID", String(data.id)],
        ["Key", data.key],
        ["Value", data.value],
        ["Usage Count", String(data.usage_count)],
        ["Created", data.created_at],
        ["Updated", data.updated_at],
      ]),
    json: (data) => data,
  },
  async *func(flags, id) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);

    const data = await apiGet<DictionaryRow>(
      { baseUrl: base, port },
      `/api/dictionary/${id}`,
    );

    yield new CommandOutput(data);
  },
});
