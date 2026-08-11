export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  pid?: number;
}

export interface SwayNode {
  focused?: boolean;
  pid?: number;
  rect?: WindowBounds;
  name?: string;
  app_id?: string | null;
  window_properties?: { class?: string };
  nodes?: SwayNode[];
  floating_nodes?: SwayNode[];
}

function normalizeWindowBounds(
  value: Partial<WindowBounds>,
): WindowBounds | null {
  const { x, y, width, height, pid } = value;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    (pid !== undefined && (!Number.isInteger(pid) || pid <= 0))
  ) {
    return null;
  }
  return {
    x,
    y,
    width,
    height,
    ...(pid === undefined ? {} : { pid }),
  };
}

/** Parse the positive screen rectangle emitted by a platform window helper. */
export function parseWindowBounds(output: string): WindowBounds | null {
  try {
    return normalizeWindowBounds(JSON.parse(output) as Partial<WindowBounds>);
  } catch {
    return null;
  }
}

/** Return Sway's focused external window rectangle, never Freestyle's own. */
export function getSwayFocusedWindowBounds(
  node: SwayNode,
  ownPid: number,
): WindowBounds | null {
  if (node.focused) {
    if (node.pid === undefined || node.pid === ownPid || !node.rect) {
      return null;
    }
    return normalizeWindowBounds({ ...node.rect, pid: node.pid });
  }
  for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) {
    const bounds = getSwayFocusedWindowBounds(child, ownPid);
    if (bounds) return bounds;
  }
  return null;
}
