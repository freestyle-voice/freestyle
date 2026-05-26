import chalk from "chalk";
import { apiPost } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";
import { formatKeyValue } from "../../lib/table.js";

interface CreateDictResult {
  id: number;
  key: string;
  value: string;
}

export const dictCreateCommand = buildCommand<CreateDictResult>({
  docs: { brief: "Create a dictionary entry" },
  parameters: {
    flags: {
      key: {
        kind: "parsed",
        parse: String,
        brief: "Word or phrase to match",
      },
      value: {
        kind: "parsed",
        parse: String,
        brief: "Replacement text",
      },
    },
  },
  output: {
    human: (data) => {
      const header = chalk.green(
        `Created dictionary entry #${String(data.id)}`,
      );
      const details = formatKeyValue([
        ["Key", data.key],
        ["Value", data.value],
      ]);
      return `${header}\n${details}`;
    },
    json: (data) => data,
  },
  async *func(flags) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);

    const result = await apiPost<CreateDictResult>(
      { baseUrl: base, port },
      "/api/dictionary",
      { key: flags.key, value: flags.value },
    );

    yield new CommandOutput(result);
  },
});
