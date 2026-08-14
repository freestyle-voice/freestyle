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

/** Toolkit slug for a connected-app tool part, or null for built-in tools. */
export function connectorToolkitSlug(partType: string): string | null {
  const name = partType.replace(/^tool-/, "");
  if (!isConnectorToolName(name)) return null;
  return name.split("__")[1] ?? null;
}

/** The short, user-facing label for an AI SDK tool part. */
export function toolPresentation(partType: string): {
  title: string;
  detail: string | undefined;
} {
  const name = partType.replace(/^tool-/, "");
  if (isConnectorToolName(name)) {
    const [, toolkitSlug = "connected app"] = name.split("__");
    const action = words(connectorToolActionName(name)).replace(
      new RegExp(
        `^${toolkitSlug.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/[-_]/g, " ")}\\s*`,
        "i",
      ),
      "",
    );
    return {
      title: `Used ${appName(toolkitSlug)}`,
      detail: action ? sentence(action) : undefined,
    };
  }

  return {
    title: TOOL_LABELS[partType] ?? sentence(words(name)),
    detail: undefined,
  };
}
