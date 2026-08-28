import type {
  CleanupAppAssignment,
  CleanupToneDestination,
} from "@freestyle-voice/validations";
import { normalizeRouteIconHost } from "../../../../shared/route-icons";
import type { AppMarkId } from "./app-marks";
import {
  resolveBuiltInAppMarkFromAppMatch,
  resolveBuiltInAppMarkFromSiteHost,
} from "./app-marks";

export const BUILTIN_ROUTE_GROUPS = {
  personal: ["messages", "whatsapp", "telegram", "discord"],
  work: ["slack", "linkedin", "work_chat"],
  email: ["gmail", "outlook", "apple_mail", "proton"],
} as const satisfies Record<
  Exclude<CleanupToneDestination, "overall">,
  readonly AppMarkId[]
>;

export type ManagedToneDestination = keyof typeof BUILTIN_ROUTE_GROUPS;

export type RouteOwnership = {
  destination: CleanupToneDestination;
  source: "builtin" | "assignment";
};

function normalizeRouteMatch(
  kind: CleanupAppAssignment["kind"],
  raw: string,
): string {
  if (kind === "site") return normalizeRouteIconHost(raw);
  return raw.trim().toLowerCase();
}

function resolveBuiltInRouteId(
  kind: CleanupAppAssignment["kind"],
  match: string,
): AppMarkId | null {
  if (kind === "site") return resolveBuiltInAppMarkFromSiteHost(match);
  return resolveBuiltInAppMarkFromAppMatch(match);
}

export function getBuiltInRouteDestination(
  kind: CleanupAppAssignment["kind"],
  match: string,
): ManagedToneDestination | null {
  const routeId = resolveBuiltInRouteId(kind, match);
  if (!routeId) return null;

  for (const [destination, ids] of Object.entries(BUILTIN_ROUTE_GROUPS) as [
    ManagedToneDestination,
    readonly AppMarkId[],
  ][]) {
    if (ids.includes(routeId)) return destination;
  }

  return null;
}

export function normalizeManagedAssignments(
  assignments: readonly CleanupAppAssignment[],
): CleanupAppAssignment[] {
  const seen = new Set<string>();
  const normalized: CleanupAppAssignment[] = [];

  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const assignment = assignments[index]!;
    const match = normalizeRouteMatch(assignment.kind, assignment.match);
    const key = `${assignment.kind}:${match}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const builtInDestination = getBuiltInRouteDestination(
      assignment.kind,
      match,
    );
    if (builtInDestination === assignment.destination) continue;

    normalized.push({ ...assignment, match });
  }

  return normalized.reverse();
}

export function findRouteOwnership(
  kind: CleanupAppAssignment["kind"],
  match: string,
  assignments: readonly CleanupAppAssignment[],
): RouteOwnership | null {
  const normalizedMatch = normalizeRouteMatch(kind, match);

  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const assignment = assignments[index]!;
    if (assignment.kind !== kind) continue;
    if (
      normalizeRouteMatch(assignment.kind, assignment.match) !== normalizedMatch
    ) {
      continue;
    }
    return {
      destination: assignment.destination,
      source: "assignment",
    };
  }

  const builtInDestination = getBuiltInRouteDestination(kind, normalizedMatch);
  return builtInDestination
    ? {
        destination: builtInDestination,
        source: "builtin",
      }
    : null;
}

export function getVisibleBuiltinRouteIds(
  destination: ManagedToneDestination,
  assignments: readonly CleanupAppAssignment[],
): AppMarkId[] {
  const hidden = new Set<AppMarkId>();

  for (const assignment of assignments) {
    const routeId = resolveBuiltInRouteId(assignment.kind, assignment.match);
    const builtInDestination = getBuiltInRouteDestination(
      assignment.kind,
      assignment.match,
    );
    if (!routeId || !builtInDestination) continue;
    if (builtInDestination === assignment.destination) continue;
    hidden.add(routeId);
  }

  return BUILTIN_ROUTE_GROUPS[destination].filter((id) => !hidden.has(id));
}

export function getDestinationLabelKey(
  destination: CleanupToneDestination,
):
  | "tone.tabs.personal"
  | "tone.tabs.work"
  | "tone.tabs.email"
  | "tone.tabs.everythingElse" {
  switch (destination) {
    case "personal":
      return "tone.tabs.personal";
    case "work":
      return "tone.tabs.work";
    case "email":
      return "tone.tabs.email";
    default:
      return "tone.tabs.everythingElse";
  }
}
