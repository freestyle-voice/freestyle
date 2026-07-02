import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FreestyleBridge } from "freestyle-voice";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type {
  ActionType,
  CommandAction,
  VoiceCommand,
} from "../../src/types.js";

const ROUTE = "/api/plugins/freestyle-voice-commands";

interface CommandsResponse {
  commands: VoiceCommand[];
  platform: string;
  isMac: boolean;
}

interface TestResult {
  matched: string[];
  fired: boolean;
  command?: string;
  detail?: string;
  llm: boolean;
}

const ACTION_LABELS: Record<ActionType, string> = {
  shortcut: "Run Shortcut",
  webhook: "Call webhook",
  openUrl: "Open URL / app",
  shell: "Run script",
};

// ---------------------------------------------------------------------------
// Bridge helpers
// ---------------------------------------------------------------------------

function getBridge(): FreestyleBridge {
  const b = window.freestyle;
  if (!b) throw new Error("Host bridge unavailable.");
  return b;
}

async function fetchCommands(): Promise<CommandsResponse> {
  const res = await getBridge().api(`${ROUTE}/commands`);
  if (!res.ok) throw new Error(`server returned ${res.status}`);
  return res.json<CommandsResponse>();
}

async function sendCommand(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<void> {
  const res = await getBridge().api(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res
      .json<{ error?: string }>()
      .catch(() => ({}) as { error?: string });
    throw new Error(err.error ?? `server returned ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function BackButton() {
  return (
    <button
      type="button"
      className="back-btn"
      onClick={() => window.freestyle?.invoke("navigate", { to: "/plugins" })}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      Plugins
    </button>
  );
}

interface FormValues {
  name: string;
  triggers: string;
  description: string;
  actionType: ActionType;
  webhookUrl: string;
  webhookMethod: "GET" | "POST";
  openUrlValue: string;
  shellCommand: string;
  shortcutName: string;
}

function toDefaults(command?: VoiceCommand): FormValues {
  const action = command?.action;
  return {
    name: command?.name ?? "",
    triggers: command?.triggers.join(", ") ?? "",
    description: command?.description ?? "",
    actionType: action?.type ?? "webhook",
    webhookUrl: action?.type === "webhook" ? action.url : "",
    webhookMethod: action?.type === "webhook" ? action.method : "POST",
    openUrlValue: action?.type === "openUrl" ? action.url : "",
    shellCommand: action?.type === "shell" ? action.command : "",
    shortcutName: action?.type === "shortcut" ? action.name : "",
  };
}

function buildAction(values: FormValues): CommandAction {
  switch (values.actionType) {
    case "webhook":
      return {
        type: "webhook",
        url: values.webhookUrl.trim(),
        method: values.webhookMethod,
      };
    case "openUrl":
      return { type: "openUrl", url: values.openUrlValue.trim() };
    case "shell":
      return { type: "shell", command: values.shellCommand.trim() };
    case "shortcut":
      return { type: "shortcut", name: values.shortcutName.trim() };
  }
}

function CommandForm({
  isMac,
  editing,
  onDone,
}: {
  isMac: boolean;
  editing?: VoiceCommand;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, reset } = useForm<FormValues>({
    defaultValues: toDefaults(editing),
  });
  const actionType = watch("actionType");

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const triggers = values.triggers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (triggers.length === 0)
        throw new Error("At least one trigger phrase is required");
      const draft = {
        name: values.name.trim(),
        triggers,
        description: values.description.trim(),
        action: buildAction(values),
        enabled: editing?.enabled ?? true,
      };
      if (editing) {
        await sendCommand("PUT", `${ROUTE}/commands/${editing.id}`, draft);
      } else {
        await sendCommand("POST", `${ROUTE}/commands`, draft);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commands"] });
      reset(toDefaults());
      onDone();
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  // macOS-only: hide the Shortcut option entirely on other platforms.
  const actionTypes: ActionType[] = isMac
    ? ["shortcut", "webhook", "openUrl", "shell"]
    : ["webhook", "openUrl", "shell"];

  return (
    <form className="card form" onSubmit={onSubmit}>
      <h2>{editing ? "Edit command" : "New command"}</h2>

      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="input"
          placeholder="Send a Slack message"
          {...register("name", { required: true })}
        />
      </label>

      <label className="field">
        <span className="field-label">Trigger phrases</span>
        <input
          className="input"
          placeholder="post to slack, message the team"
          {...register("triggers", { required: true })}
        />
        <span className="hint">
          Comma-separated. Any match arms the command.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Description</span>
        <input
          className="input"
          placeholder="Posts the dictated message to the team Slack channel."
          {...register("description")}
        />
        <span className="hint">
          Tells the assistant when to run this and what payload to extract.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Action</span>
        <select className="input" {...register("actionType")}>
          {actionTypes.map((t) => (
            <option key={t} value={t}>
              {ACTION_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {actionType === "webhook" && (
        <div className="field-row">
          <label className="field field-grow">
            <span className="field-label">URL</span>
            <input
              className="input"
              placeholder="https://example.com/hook"
              {...register("webhookUrl", { required: true })}
            />
          </label>
          <label className="field">
            <span className="field-label">Method</span>
            <select className="input" {...register("webhookMethod")}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </label>
        </div>
      )}

      {actionType === "openUrl" && (
        <label className="field">
          <span className="field-label">URL or app scheme</span>
          <input
            className="input"
            placeholder="https://google.com/search?q={{input}}"
            {...register("openUrlValue", { required: true })}
          />
          <span className="hint">
            {"{{input}}"} is replaced with the spoken payload.
          </span>
        </label>
      )}

      {actionType === "shell" && (
        <label className="field">
          <span className="field-label">Command</span>
          <input
            className="input mono"
            placeholder='echo "{{input}}" >> ~/notes.txt'
            {...register("shellCommand", { required: true })}
          />
          <span className="hint">
            {"{{input}}"} and the $FREESTYLE_COMMAND_INPUT env var carry the
            payload.
          </span>
        </label>
      )}

      {actionType === "shortcut" && isMac && (
        <label className="field">
          <span className="field-label">Shortcut name</span>
          <input
            className="input"
            placeholder="Add to Reminders"
            {...register("shortcutName", { required: true })}
          />
          <span className="hint">
            The payload is piped to the shortcut's input. macOS only.
          </span>
        </label>
      )}

      {mutation.error ? (
        <p className="error-text">{mutation.error.message}</p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="ghost-btn" onClick={onDone}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-btn"
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? "Saving…"
            : editing
              ? "Save changes"
              : "Add command"}
        </button>
      </div>
    </form>
  );
}

function CommandRow({
  command,
  onEdit,
}: {
  command: VoiceCommand;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => sendCommand("DELETE", `${ROUTE}/commands/${command.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["commands"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: () =>
      sendCommand("PUT", `${ROUTE}/commands/${command.id}`, {
        name: command.name,
        triggers: command.triggers,
        description: command.description,
        action: command.action,
        enabled: !command.enabled,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["commands"] }),
  });

  return (
    <li className={`command-row${command.enabled ? "" : " disabled"}`}>
      <div className="command-main">
        <span className="command-name">{command.name}</span>
        <span className="command-triggers">
          {command.triggers.map((t) => (
            <span key={t} className="trigger-chip">
              {t}
            </span>
          ))}
        </span>
      </div>
      <span className="action-badge">{ACTION_LABELS[command.action.type]}</span>
      <div className="row-actions">
        <button type="button" className="row-btn" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className="row-btn"
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
        >
          {command.enabled ? "Disable" : "Enable"}
        </button>
        <button
          type="button"
          className="row-btn delete-btn"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function TestBox() {
  const [text, setText] = useState("");
  const mutation = useMutation({
    mutationFn: async (value: string): Promise<TestResult> => {
      const res = await getBridge().api(`${ROUTE}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      if (!res.ok) {
        const err = await res
          .json<{ error?: string }>()
          .catch(() => ({}) as { error?: string });
        throw new Error(err.error ?? `server returned ${res.status}`);
      }
      return res.json<TestResult>();
    },
  });

  const result = mutation.data;

  return (
    <section className="card">
      <h2>Try a phrase</h2>
      <p className="muted">
        Speak — or type — an utterance to see whether it triggers a command.
        This runs the real pipeline and will execute the matched action.
      </p>
      <div className="field-row">
        <input
          className="input field-grow"
          placeholder="post to slack that I'll be five minutes late"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) mutation.mutate(text.trim());
          }}
        />
        <button
          type="button"
          className="primary-btn"
          disabled={mutation.isPending || !text.trim()}
          onClick={() => mutation.mutate(text.trim())}
        >
          {mutation.isPending ? "Running…" : "Run"}
        </button>
      </div>
      {mutation.error ? (
        <p className="error-text">{mutation.error.message}</p>
      ) : null}
      {result ? (
        <div className={`test-result${result.fired ? " fired" : ""}`}>
          {result.fired ? (
            <p>
              <strong>Fired:</strong> {result.command}
              {result.detail ? ` — ${result.detail}` : ""}
            </p>
          ) : result.matched.length > 0 ? (
            <p>Matched {result.matched.join(", ")}, but no command was run.</p>
          ) : (
            <p>No command matched — this would be dictated as normal text.</p>
          )}
          {!result.llm ? (
            <p className="hint">
              No cleanup LLM is configured, so matching is deterministic (first
              trigger wins).
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function App() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["commands"],
    queryFn: fetchCommands,
  });
  const [editing, setEditing] = useState<VoiceCommand | null>(null);
  const [creating, setCreating] = useState(false);

  const isMac = data?.isMac ?? false;
  const showForm = creating || editing !== null;

  return (
    <main className="page">
      <BackButton />
      <header className="head-row">
        <h1 className="page-title">Voice Commands</h1>
        {!showForm && (
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            New command
          </button>
        )}
      </header>

      {isLoading && <p className="muted">Loading…</p>}

      {error && (
        <section className="card error">
          <p>
            Couldn't load commands:{" "}
            {error instanceof Error ? error.message : String(error)}
          </p>
        </section>
      )}

      {showForm && (
        <CommandForm
          isMac={isMac}
          editing={editing ?? undefined}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {data && !showForm && (
        <>
          {data.commands.length === 0 ? (
            <section className="card">
              <p className="muted">
                No commands yet. Create one to turn a spoken phrase into an
                action.
              </p>
            </section>
          ) : (
            <ul className="command-list">
              {data.commands.map((command) => (
                <CommandRow
                  key={command.id}
                  command={command}
                  onEdit={() => {
                    setCreating(false);
                    setEditing(command);
                  }}
                />
              ))}
            </ul>
          )}
          <TestBox />
        </>
      )}
    </main>
  );
}
