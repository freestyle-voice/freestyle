/**
 * Action executor registry.
 *
 * The server defines *which* actions can be invoked by the shortcuts agent,
 * but the actual side-effect implementations live in the Electron main
 * process (which has access to `shell`, `clipboard`, etc.).
 *
 * At startup the Electron main process calls `registerActionHandler` for
 * every built-in action.  When the agent triggers an action the server
 * calls `executeAction`, which delegates to the registered handler.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export type ActionHandler = (
  params: Record<string, unknown>,
) => Promise<ActionResult>;

const handlers = new Map<string, ActionHandler>();

export function registerActionHandler(
  action: string,
  handler: ActionHandler,
): void {
  handlers.set(action, handler);
}

export async function executeAction(
  action: string,
  params: Record<string, unknown>,
): Promise<ActionResult> {
  const handler = handlers.get(action);
  if (!handler) {
    return {
      ok: false,
      message: `No handler registered for action: ${action}`,
    };
  }
  try {
    return await handler(params);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
