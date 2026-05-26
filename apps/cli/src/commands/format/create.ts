import chalk from "chalk";
import { apiPost } from "../../lib/api-client.js";
import { buildCommand } from "../../lib/command.js";
import { DEFAULT_PORT, getBaseUrl } from "../../lib/constants.js";
import { CommandOutput } from "../../lib/output.js";
import { formatKeyValue } from "../../lib/table.js";

interface CreateFormatResult {
  id: number;
  app_pattern: string;
  label: string;
  instructions: string;
}

export const formatCreateCommand = buildCommand<CreateFormatResult>({
  docs: { brief: "Create a formatting rule" },
  parameters: {
    flags: {
      "app-pattern": {
        kind: "parsed",
        parse: String,
        brief: "App pattern to match (e.g. 'slack|discord')",
      },
      label: {
        kind: "parsed",
        parse: String,
        brief: "Display label for this rule",
      },
      instructions: {
        kind: "parsed",
        parse: String,
        brief: "Formatting instructions for the LLM",
      },
    },
  },
  output: {
    human: (data) => {
      const header = chalk.green(`Created format rule #${String(data.id)}`);
      const details = formatKeyValue([
        ["Label", data.label],
        ["Pattern", data.app_pattern],
        ["Instructions", data.instructions],
      ]);
      return `${header}\n${details}`;
    },
    json: (data) => data,
  },
  async *func(flags) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);

    const result = await apiPost<CreateFormatResult>(
      { baseUrl: base, port },
      "/api/formats",
      {
        app_pattern: flags["app-pattern"],
        label: flags.label,
        instructions: flags.instructions,
      },
    );

    yield new CommandOutput(result);
  },
});
