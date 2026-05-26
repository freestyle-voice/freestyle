import chalk from "chalk";
import { apiPut } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";

interface UpdateResult {
  ok: boolean;
  id: string;
}

export const formatUpdateCommand = buildCommand<UpdateResult>({
  docs: { brief: "Update a formatting rule" },
  parameters: {
    flags: {
      "app-pattern": {
        kind: "parsed",
        parse: String,
        brief: "New app pattern",
        optional: true,
        default: undefined,
      },
      label: {
        kind: "parsed",
        parse: String,
        brief: "New label",
        optional: true,
        default: undefined,
      },
      instructions: {
        kind: "parsed",
        parse: String,
        brief: "New formatting instructions",
        optional: true,
        default: undefined,
      },
    },
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
    human: (data) => chalk.green(`Updated format rule #${data.id}`),
    json: (data) => data,
  },
  async *func(flags, id) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);

    const body: Record<string, string> = {};
    if (flags["app-pattern"] !== undefined)
      body.app_pattern = flags["app-pattern"];
    if (flags.label !== undefined) body.label = flags.label;
    if (flags.instructions !== undefined)
      body.instructions = flags.instructions;

    await apiPut<{ ok: boolean }>(
      { baseUrl: base, port },
      `/api/formats/${id}`,
      body,
    );

    yield new CommandOutput({ ok: true, id });
  },
});
