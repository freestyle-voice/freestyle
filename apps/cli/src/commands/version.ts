import { apiGetText } from "../lib/api-client.js";
import { buildCommand } from "../lib/command.js";
import { DEFAULT_PORT, getBaseUrl, VERSION } from "../lib/constants.js";
import { CommandOutput } from "../lib/output.js";
import { formatKeyValue } from "../lib/table.js";

interface VersionData {
  cli: string;
  server: string | null;
}

export const versionCommand = buildCommand<VersionData>({
  docs: { brief: "Show CLI and server version" },
  output: {
    human: (data) => {
      const pairs: [string, string][] = [["CLI", data.cli]];
      if (data.server) {
        pairs.push(["Server", data.server]);
      } else {
        pairs.push(["Server", "(not reachable)"]);
      }
      return formatKeyValue(pairs);
    },
    json: (data) => data,
  },
  async *func(flags) {
    const port = flags.port ?? DEFAULT_PORT;
    const base = getBaseUrl(port);
    let serverVersion: string | null = null;
    try {
      serverVersion = await apiGetText({ baseUrl: base, port }, "/");
    } catch {
      // Server unreachable -- not an error for version command
    }

    yield new CommandOutput({ cli: VERSION, server: serverVersion });
  },
});
