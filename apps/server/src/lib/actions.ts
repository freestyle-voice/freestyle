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
