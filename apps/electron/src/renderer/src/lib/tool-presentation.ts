import {
  connectorToolActionName,
  isConnectorToolName,
} from "@renderer/lib/connectors";

const TOOL_LABELS: Record<string, string> = {
  "tool-current_time": "Checked the time",
  "tool-web_search": "Searched the web",
  "tool-image_search": "Searched for images",
  "tool-get_context": "Looked at your screen",
  "tool-read_document": "Read the document",
  "tool-get_clipboard": "Read your clipboard",
  "tool-set_clipboard": "Updated your clipboard",
  "tool-paste": "Pasted at your cursor",
  "tool-Bash": "Ran a command",
  "tool-Read": "Read a file",
  "tool-Write": "Wrote a file",
  "tool-Edit": "Edited a file",
  "tool-Glob": "Listed files",
  "tool-Grep": "Searched files",
  "tool-brain_read": "Recalled a memory",
  "tool-brain_write": "Saved a memory",
  "tool-brain_edit": "Updated a memory",
  "tool-brain_glob": "Browsed memories",
  "tool-brain_search": "Searched memories",
  "tool-brain_delete": "Forgot a memory",
  "tool-emote": "Changed expression",
  "tool-connector_search_tools": "Looked up connected-app actions",
  "tool-suggest_connections": "Suggested apps to connect",
};

const RUNNING_LABELS: Record<string, string> = {
  "tool-connector_search_tools": "Looking up connected-app actions",
  "tool-current_time": "Checking the time",
  "tool-web_search": "Searching the web",
  "tool-image_search": "Searching for images",
  "tool-get_context": "Looking at your screen",
  "tool-read_document": "Reading the document",
  "tool-get_clipboard": "Reading your clipboard",
  "tool-set_clipboard": "Updating your clipboard",
  "tool-paste": "Pasting at your cursor",
  "tool-Bash": "Running a command",
  "tool-Read": "Reading a file",
  "tool-Write": "Writing a file",
  "tool-Edit": "Editing a file",
  "tool-Glob": "Listing files",
  "tool-Grep": "Searching files",
  "tool-brain_read": "Recalling a memory",
  "tool-brain_write": "Saving a memory",
  "tool-brain_edit": "Updating a memory",
  "tool-brain_glob": "Browsing memories",
  "tool-brain_search": "Searching memories",
  "tool-brain_delete": "Forgetting a memory",
  "tool-notify": "Sending you a notification",
  "tool-suggest_connections": "Looking for apps that would help",
};

const DECLINED_LABELS: Record<string, string> = {
  "tool-set_clipboard": "Didn't touch your clipboard — you declined",
  "tool-paste": "Didn't paste — you declined",
  "tool-Bash": "Didn't run that command — you declined",
  "tool-Write": "Didn't write that file — you declined",
  "tool-Edit": "Didn't edit that file — you declined",
  "tool-Read": "Didn't read that file — you declined",
};

const APP_NAMES: Record<string, string> = {
  gmail: "Gmail",
  github: "GitHub",
  google_drive: "Google Drive",
  google_calendar: "Google Calendar",
  slack: "Slack",
  notion: "Notion",
};

function sentence(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function words(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function appName(slug: string): string {
  return (
    APP_NAMES[slug] ??
    slug
      .split(/[-_]/)
      .filter(Boolean)
      .map((word) => sentence(word))
      .join(" ")
  );
}

export function connectorToolkitSlug(partType: string): string | null {
  const name = partType.replace(/^tool-/, "");
  if (!isConnectorToolName(name)) return null;
  return name.split("__")[1] ?? null;
}

export type ToolPhase = "running" | "done" | "declined" | "failed";

export function toolPresentation(
  partType: string,
  phase: ToolPhase = "done",
  input?: unknown,
): {
  title: string;
  detail: string | undefined;
} {
  const name = partType.replace(/^tool-/, "");
  if (isConnectorToolName(name)) {
    const [, toolkitSlug = "connected app"] = name.split("__");
    const action = words(connectorToolActionName(name, input)).replace(
      new RegExp(
        `^${toolkitSlug.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/[-_]/g, " ")}\\s*`,
        "i",
      ),
      "",
    );
    const app = appName(toolkitSlug);
    const title =
      phase === "running"
        ? `Using ${app}`
        : phase === "declined"
          ? `Didn't use ${app} — you declined`
          : phase === "failed"
            ? `${app} didn't respond`
            : `Used ${app}`;
    return { title, detail: action ? sentence(action) : undefined };
  }

  if (phase === "declined") {
    return {
      title:
        DECLINED_LABELS[partType] ??
        `Didn't ${words(name)} — you declined`.replace(/\s+/g, " "),
      detail: undefined,
    };
  }
  if (phase === "failed") {
    return {
      title: `${TOOL_LABELS[partType] ?? sentence(words(name))} — didn't work`,
      detail: undefined,
    };
  }
  if (phase === "running") {
    return {
      title: RUNNING_LABELS[partType] ?? sentence(words(name)),
      detail: undefined,
    };
  }

  return {
    title: TOOL_LABELS[partType] ?? sentence(words(name)),
    detail: undefined,
  };
}
