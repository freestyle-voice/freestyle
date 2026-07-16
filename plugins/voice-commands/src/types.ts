/** The kinds of actions a voice command can trigger. */
export type ActionType = "shortcut" | "webhook" | "openUrl" | "shell";

/** Call an HTTP endpoint. The extracted input is sent as JSON (POST) or query (GET). */
export interface WebhookAction {
  type: "webhook";
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
}

/** Open a URL (or app URL scheme) with the host OS opener. `{{input}}` is substituted. */
export interface OpenUrlAction {
  type: "openUrl";
  url: string;
}

/**
 * Run a shell command. `{{input}}` is substituted into the command string and
 * the raw input is also exposed as the `FREESTYLE_COMMAND_INPUT` env var.
 */
export interface ShellAction {
  type: "shell";
  command: string;
}

/**
 * Run a macOS Shortcut by name (macOS only). The extracted input is piped to
 * the shortcut on stdin. Hidden/inert on non-macOS hosts.
 */
export interface ShortcutAction {
  type: "shortcut";
  name: string;
}

export type CommandAction =
  | WebhookAction
  | OpenUrlAction
  | ShellAction
  | ShortcutAction;

/** Outcome of running the detection pipeline over an utterance. */
export interface DetectionResult {
  /** Names of the commands whose triggers matched the prefilter. */
  matched: string[];
  /** Whether a command actually fired (action executed). */
  fired: boolean;
  /** The command that fired, if any. */
  command?: string;
  /** Human-readable detail of what happened (or the failure message). */
  detail?: string;
  /** Whether the LLM agent path ran (vs the deterministic fallback). */
  llm: boolean;
}

/** A user-defined voice command: trigger phrases → an action. */
export interface VoiceCommand {
  /** Stable id (generated on create). */
  id: string;
  /** Human-readable label shown in the UI. */
  name: string;
  /** Phrases that gate the command. Any match makes it a candidate for the agent. */
  triggers: string[];
  /** Natural-language description of when to run this — used as the LLM tool description. */
  description: string;
  /** What to do when this command fires. */
  action: CommandAction;
  /** Whether the command participates in matching. */
  enabled: boolean;
}
