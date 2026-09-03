export const REMIX_TODOS_PATH = "todos.md";

const TODO_ITEM_RE = /^(\s*)- \[( |x|X)\] (.*)$/;

export type RemixTodoItem = { line: number; done: boolean; text: string };

export function parseRemixTodos(text: string | null | undefined): {
  lines: string[];
  items: RemixTodoItem[];
} {
  const lines = text?.split("\n") ?? [];
  const items: RemixTodoItem[] = [];
  lines.forEach((line, index) => {
    const match = line.match(TODO_ITEM_RE);
    if (!match) return;
    items.push({
      line: index,
      done: match[2].toLowerCase() === "x",
      text: match[3],
    });
  });
  return { lines, items };
}

export function toggleRemixTodo(
  lines: string[],
  item: RemixTodoItem,
): string[] {
  const next = [...lines];
  next[item.line] = next[item.line].replace(
    item.done ? /- \[[xX]\]/ : /- \[ \]/,
    item.done ? "- [ ]" : "- [x]",
  );
  return next;
}

export function appendRemixTodo(lines: string[], text: string): string[] {
  const next = [...lines];
  while (next.at(-1)?.trim() === "") next.pop();
  next.push(`- [ ] ${text}`, "");
  return next;
}
