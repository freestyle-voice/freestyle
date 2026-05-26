import chalk from "chalk";
import { apiPut } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";

interface UpdateResult {
  id: number;
  key: string;
  value: string;
}

export const dictUpdateCommand = buildCommand<UpdateResult>({
  docs: { brief: "Update a dictionary entry" },
  parameters: {
    flags: {
      key: {
        kind: "parsed",
        parse: String,
        brief: "New key",
        optional: true,
        default: undefined,
      },
      value: {
        kind: "parsed",
        parse: String,
        brief: "New value",
        optional: true,
        default: undefined,
      },
    },
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
      chalk.green(`Updated dictionary entry #${String(data.id)}`),
    json: (data) => data,
  },
  async *func(flags, id) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);

    const body: Record<string, string> = {};
    if (flags.key !== undefined) body.key = flags.key;
    if (flags.value !== undefined) body.value = flags.value;

    const result = await apiPut<UpdateResult>(
      { baseUrl: base, port },
      `/api/dictionary/${id}`,
      body,
    );

    yield new CommandOutput(result);
  },
});
