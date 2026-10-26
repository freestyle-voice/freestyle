import { writeBrainFile } from "@renderer/lib/brain-fs";
import { brainFileQueryOptions, queryKeys } from "@renderer/lib/query";
import {
  appendRemixTodo,
  parseRemixTodos,
  REMIX_TODOS_PATH,
  type RemixTodoItem,
  toggleRemixTodo,
} from "@renderer/lib/remix-tasks";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Action =
  | { kind: "add"; text: string; previousCount: number }
  | { kind: "toggle"; item: RemixTodoItem };
type EditorState = {
  draft: string;
  pending: boolean;
  error: boolean;
  failed: Action | null;
  saveId: string | null;
};
const editorKey = ["remix-task-editor"] as const;
const initial: EditorState = {
  draft: "",
  pending: false,
  error: false,
  failed: null,
  saveId: null,
};

/** One controller for both task views; cache lifetime also preserves drafts across tabs. */
export function useRemixTaskEditor() {
  const client = useQueryClient();
  const query = useQuery(brainFileQueryOptions(REMIX_TODOS_PATH));
  const { data: state } = useQuery({
    queryKey: editorKey,
    queryFn: () => initial,
    initialData: initial,
    staleTime: Infinity,
  });
  const patch = (next: Partial<EditorState>) =>
    client.setQueryData<EditorState>(editorKey, (old) => ({
      ...(old ?? initial),
      ...next,
    }));

  const save = async (action: Action, retry = false): Promise<void> => {
    if (client.getQueryData<EditorState>(editorKey)?.pending) return;
    const saveId = crypto.randomUUID();
    const current = () =>
      client.getQueryData<EditorState>(editorKey)?.saveId === saveId;
    patch({ pending: true, error: false, failed: null, saveId });
    try {
      const text = retry
        ? await client.fetchQuery({
            ...brainFileQueryOptions(REMIX_TODOS_PATH),
            staleTime: 0,
          })
        : client.getQueryData<string>(queryKeys.brain.file(REMIX_TODOS_PATH));
      if (text === undefined) throw new Error("Tasks are unavailable");
      const { lines, items } = parseRemixTodos(text);
      let next = lines;
      if (action.kind === "add") {
        // A response can fail after the server writes. Confirm before retrying.
        if (
          items.filter((item) => item.text === action.text).length <=
          action.previousCount
        )
          next = appendRemixTodo(lines, action.text);
      } else {
        const item = items.find(
          (item) =>
            item.line === action.item.line && item.text === action.item.text,
        );
        if (!item) throw new Error("Tasks changed; choose the task again");
        if (item.done === action.item.done) next = toggleRemixTodo(lines, item);
      }
      const result = next.join("\n");
      if (result !== text && !(await writeBrainFile(REMIX_TODOS_PATH, result)))
        throw new Error("Could not save tasks");
      if (!current()) return;
      client.setQueryData(queryKeys.brain.file(REMIX_TODOS_PATH), result);
      if (
        action.kind === "add" &&
        client.getQueryData<EditorState>(editorKey)?.draft.trim() ===
          action.text
      )
        patch({ draft: "" });
    } catch {
      if (!current()) return;
      patch({ error: true, failed: action });
      // A failed conditional write drops the read cache. Reconcile without
      // discarding the draft or optimistic whole-file snapshots.
      await client.invalidateQueries({
        queryKey: queryKeys.brain.file(REMIX_TODOS_PATH),
      });
    } finally {
      if (current()) patch({ pending: false });
    }
  };
  return {
    query,
    ...state,
    setDraft: (draft: string) => patch({ draft }),
    add: () => {
      const text = state.draft.trim();
      if (text)
        void save({
          kind: "add",
          text,
          previousCount: parseRemixTodos(query.data).items.filter(
            (item) => item.text === text,
          ).length,
        });
    },
    toggle: (item: RemixTodoItem) => void save({ kind: "toggle", item }),
    retry: () => {
      if (state.failed) void save(state.failed, true);
    },
  };
}
