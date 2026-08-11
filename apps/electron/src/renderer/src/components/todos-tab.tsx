import { readBrainFile, writeBrainFile } from "@renderer/lib/brain-fs";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

const TODOS_PATH = "todos.md";
const ITEM_RE = /^(\s*)- \[( |x|X)\] (.*)$/;

interface TodoItem {
  line: number;
  done: boolean;
  text: string;
}

function parseItems(lines: string[]): TodoItem[] {
  const items: TodoItem[] = [];
  lines.forEach((raw, i) => {
    const m = raw.match(ITEM_RE);
    if (m)
      items.push({ line: i, done: m[2].toLowerCase() === "x", text: m[3] });
  });
  return items;
}

export function TodosTab({ mascot }: { mascot: string }): React.JSX.Element {
  const [lines, setLines] = useState<string[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ line: number; text: string } | null>(
    null,
  );

  const load = useCallback((): void => {
    void readBrainFile(TODOS_PATH).then((text) => {
      setLines(text === null ? [] : text.split("\n"));
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = (next: string[]): void => {
    setLines(next);
    void writeBrainFile(TODOS_PATH, next.join("\n"));
  };

  if (lines === null) return <div className="tavern-empty">Loading…</div>;

  const items = parseItems(lines);

  const toggle = (item: TodoItem): void => {
    const next = [...lines];
    next[item.line] = next[item.line].replace(
      item.done ? /- \[[xX]\]/ : /- \[ \]/,
      item.done ? "- [ ]" : "- [x]",
    );
    save(next);
  };

  const remove = (item: TodoItem): void => {
    const next = [...lines];
    next.splice(item.line, 1);
    save(next);
  };

  const commitEdit = (): void => {
    if (!editing) return;
    const next = [...lines];
    const trimmed = editing.text.trim();
    const m = next[editing.line].match(ITEM_RE);
    if (!trimmed) next.splice(editing.line, 1);
    else if (m) next[editing.line] = `${m[1]}- [${m[2]}] ${trimmed}`;
    setEditing(null);
    save(next);
  };

  const add = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const next = [...lines];
    while (next.length > 0 && next[next.length - 1].trim() === "") next.pop();
    next.push(`- [ ] ${text}`, "");
    save(next);
  };

  return (
    <>
      {items.length === 0 ? (
        <div className="tavern-empty">
          Nothing to do — add one below, or ask Freestyle to remember one.
        </div>
      ) : null}
      {items.map((item) => (
        <div
          key={`${item.line}-${item.text}`}
          className={`tavern-todo${item.done ? " is-done" : ""}`}
        >
          <input
            type="checkbox"
            className="tavern-todo-check"
            checked={item.done}
            onChange={() => toggle(item)}
          />
          {editing?.line === item.line ? (
            <input
              className="tavern-todo-edit"
              value={editing.text}
              ref={(el) => el?.focus()}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(null);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="tavern-todo-text"
              onClick={() => setEditing({ line: item.line, text: item.text })}
            >
              {item.text}
            </button>
          )}
          <button
            type="button"
            className="tavern-todo-remove"
            aria-label="Remove"
            onClick={() => remove(item)}
          >
            ×
          </button>
        </div>
      ))}
      <input
        className="tavern-todo-add"
        value={draft}
        placeholder="Add a to-do"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
      />
      {items.some((i) => i.done) ? (
        <div className="tavern-todo-streak">
          <span className="tavern-todo-streak-line">
            ◆ {items.filter((i) => i.done).length} cleared
          </span>
          <div className="tavern-todo-streak-sub">
            {mascot} keeps count. Quietly.
          </div>
        </div>
      ) : null}
    </>
  );
}
