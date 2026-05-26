import chalk from "chalk";
import { apiDelete } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";

interface DeleteResult {
  ok: boolean;
  id: string;
}

export const formatDeleteCommand = buildCommand<DeleteResult>({
  docs: { brief: "Delete a formatting rule" },
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
    human: (data) => chalk.green(`Deleted format rule #${data.id}`),
    json: (data) => data,
  },
  async *func(flags, id) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);

    await apiDelete<{ ok: boolean }>(
      { baseUrl: base, port },
      `/api/formats/${id}`,
    );

    yield new CommandOutput({ ok: true, id });
  },
});
