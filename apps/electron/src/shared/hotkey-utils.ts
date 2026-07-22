import { normalizeAccelerator } from "../main/hotkey-utils";

const MODIFIER_ORDER = [
  "Control",
  "CommandOrControl",
  "Command",
  "Alt",
  "Shift",
  "Fn",
  "RightAlt",
  "RightControl",
  "RightShift",
  "RightCommand",
  "RightSuper",
] as const;

const MODIFIERS = new Set<string>(MODIFIER_ORDER);

/**
 * Produce a stable accelerator identity for equality comparisons.
 *
 * Registration and persistence must continue to use normalizeAccelerator();
 * this helper additionally deduplicates and orders modifiers only so aliases
 * and input order do not affect comparisons.
 */
export function canonicalizeAccelerator(accel: string): string {
  const normalized = normalizeAccelerator(accel);
  const modifiers = new Set<string>();
  let key: string | null = null;

  for (const part of normalized.split("+")) {
    const token = part.trim();
    if (!token) continue;

    if (MODIFIERS.has(token)) {
      modifiers.add(token);
    } else {
      key = token;
    }
  }

  const orderedModifiers = MODIFIER_ORDER.filter((modifier) =>
    modifiers.has(modifier),
  );
  return key
    ? [...orderedModifiers, key].join("+")
    : orderedModifiers.join("+");
}

export function acceleratorsEqual(a: string, b: string): boolean {
  return canonicalizeAccelerator(a) === canonicalizeAccelerator(b);
}
