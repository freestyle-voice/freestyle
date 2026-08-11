import type { CleanupAppAssignment } from "@freestyle-voice/validations";
import appleMailIcon from "@renderer/assets/route-icons/apple-mail.svg";
import discordIcon from "@renderer/assets/route-icons/discord.svg";
import gmailIcon from "@renderer/assets/route-icons/gmail.svg";
import linkedinIcon from "@renderer/assets/route-icons/linkedin.svg";
import messagesIcon from "@renderer/assets/route-icons/messages.svg";
import outlookIcon from "@renderer/assets/route-icons/outlook.svg";
import protonIcon from "@renderer/assets/route-icons/proton.svg";
import slackIcon from "@renderer/assets/route-icons/slack.svg";
import teamsIcon from "@renderer/assets/route-icons/teams.svg";
import telegramIcon from "@renderer/assets/route-icons/telegram.svg";
import whatsappIcon from "@renderer/assets/route-icons/whatsapp.svg";
import { cn } from "@renderer/lib/utils";
import { Globe, Mail, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import {
  type BuiltinRouteIconId,
  normalizeRouteIconHost,
} from "../../../../shared/route-icons";

// ---------------------------------------------------------------------------
// Route marks — larger app/site tiles used in the tone page's "Routes from"
// shelf. Built-in routes ship as bundled assets, while user-added apps/sites
// use generic local fallback icons so the page never depends on remote assets.
// ---------------------------------------------------------------------------

export type AppMarkId = BuiltinRouteIconId;

type Mark = {
  label: string;
  bg: string;
  art?: React.ReactNode;
  src?: string;
  artScale?: number;
  imageClassName?: string;
};

type RouteMarkDescriptor =
  | { kind: "builtin"; id: AppMarkId; label: string }
  | { kind: "app"; label: string; match: string }
  | { kind: "site"; label: string; host: string };

const APP_MARK_ALIASES: Record<string, AppMarkId> = {
  "apple mail": "apple_mail",
  "apple messages": "messages",
  discord: "discord",
  gmail: "gmail",
  linkedin: "linkedin",
  messages: "messages",
  "microsoft teams": "work_chat",
  outlook: "outlook",
  proton: "proton",
  "proton mail": "proton",
  slack: "slack",
  telegram: "telegram",
  teams: "work_chat",
  whatsapp: "whatsapp",
};

const SITE_MARK_ALIASES: Record<string, AppMarkId> = {
  "discord.com": "discord",
  "gmail.com": "gmail",
  "linkedin.com": "linkedin",
  "mail.google.com": "gmail",
  "messages.apple.com": "messages",
  "outlook.com": "outlook",
  "proton.me": "proton",
  "protonmail.com": "proton",
  "slack.com": "slack",
  "teams.microsoft.com": "work_chat",
  "telegram.org": "telegram",
  "web.telegram.org": "telegram",
  "web.whatsapp.com": "whatsapp",
  "whatsapp.com": "whatsapp",
};

const APP_MARKS: Record<AppMarkId, Mark> = {
  messages: {
    label: "Messages",
    bg: "transparent",
    src: messagesIcon,
    imageClassName: "size-[94%] rounded-[8px] object-contain",
  },
  whatsapp: {
    label: "WhatsApp",
    bg: "linear-gradient(180deg,#4AE168,#22C15E)",
    src: whatsappIcon,
    imageClassName: "size-[60%] object-contain",
  },
  telegram: {
    label: "Telegram",
    bg: "transparent",
    src: telegramIcon,
    imageClassName: "size-[94%] rounded-[8px] object-contain",
  },
  discord: {
    label: "Discord",
    bg: "linear-gradient(180deg,#6A76F5,#4E5BE0)",
    src: discordIcon,
    imageClassName: "size-[60%] object-contain",
  },
  slack: {
    label: "Slack",
    bg: "transparent",
    src: slackIcon,
    imageClassName: "size-[94%] rounded-[8px] object-contain",
  },
  linkedin: {
    label: "LinkedIn",
    bg: "#0A66C2",
    src: linkedinIcon,
    imageClassName: "size-[60%] object-contain",
  },
  work_chat: {
    label: "Microsoft Teams",
    bg: "linear-gradient(180deg,#6B74F6,#5059C9)",
    src: teamsIcon,
    imageClassName: "size-[60%] object-contain",
  },
  gmail: {
    label: "Gmail",
    bg: "transparent",
    src: gmailIcon,
    imageClassName: "size-[94%] rounded-[8px] object-contain",
  },
  outlook: {
    label: "Outlook",
    bg: "transparent",
    src: outlookIcon,
    imageClassName: "size-[94%] rounded-[8px] object-contain",
  },
  apple_mail: {
    label: "Apple Mail",
    bg: "transparent",
    src: appleMailIcon,
    imageClassName: "size-[94%] rounded-[8px] object-contain",
  },
  proton: {
    label: "Proton Mail",
    bg: "transparent",
    src: protonIcon,
    imageClassName: "size-[94%] rounded-[8px] object-contain",
  },
};

function normalizeLabel(raw: string): string {
  return raw.trim().toLowerCase();
}

function hostFromSiteMatch(raw: string): string {
  return normalizeRouteIconHost(raw);
}

function initialsFromLabel(label: string): string {
  const words = label
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

function resolveSiteAlias(host: string): AppMarkId | null {
  const normalized = hostFromSiteMatch(host);
  for (const [domain, markId] of Object.entries(SITE_MARK_ALIASES)) {
    if (normalized === domain || normalized.endsWith(`.${domain}`)) {
      return markId;
    }
  }
  return null;
}

export function getAppMarkLabel(id: AppMarkId): string {
  return APP_MARKS[id].label;
}

export function resolveBuiltInAppMarkFromAppMatch(
  raw: string,
): AppMarkId | null {
  return APP_MARK_ALIASES[normalizeLabel(raw)] ?? null;
}

export function resolveBuiltInAppMarkFromSiteHost(
  raw: string,
): AppMarkId | null {
  return resolveSiteAlias(raw);
}

function resolveAssignmentMark(
  assignment: CleanupAppAssignment,
): RouteMarkDescriptor {
  if (assignment.kind === "site") {
    const host = hostFromSiteMatch(assignment.match || assignment.label);
    const builtIn = resolveSiteAlias(host);
    if (builtIn) {
      return {
        kind: "builtin",
        id: builtIn,
        label: APP_MARKS[builtIn].label,
      };
    }
    return { kind: "site", label: assignment.label, host };
  }

  const builtIn = APP_MARK_ALIASES[normalizeLabel(assignment.match)];
  if (builtIn) {
    return {
      kind: "builtin",
      id: builtIn,
      label: APP_MARKS[builtIn].label,
    };
  }

  return { kind: "app", label: assignment.label, match: assignment.match };
}

function MarkImage({
  src,
  label,
  className,
}: {
  src: string;
  label: string;
  className?: string;
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <MonitorSmartphone
        aria-hidden="true"
        className="text-muted-foreground size-4"
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      aria-label={label}
      className={cn("object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}

function MarkTile({
  label,
  background,
  children,
  size,
  className,
  interactive = false,
  onEnter,
  onExit,
}: {
  label: string;
  background?: string;
  children: React.ReactNode;
  size: number;
  className?: string;
  interactive?: boolean;
  onEnter?: () => void;
  onExit?: () => void;
}): React.JSX.Element {
  return (
    <span
      role="img"
      aria-label={label}
      tabIndex={interactive ? 0 : undefined}
      onMouseEnter={onEnter}
      onFocus={interactive ? onEnter : undefined}
      onMouseLeave={onExit}
      onBlur={interactive ? onExit : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[8px] transition-transform duration-150 ease-out",
        interactive &&
          "hover:-translate-y-1 hover:scale-[1.08] focus-visible:-translate-y-1 focus-visible:scale-[1.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
        className,
      )}
      style={{ width: size, height: size, background }}
      title={label}
    >
      {children}
    </span>
  );
}

export function RouteMark({
  id,
  assignment,
  size = 30,
  className,
  interactive = false,
  onEnter,
  onExit,
}: {
  id?: AppMarkId;
  assignment?: CleanupAppAssignment;
  size?: number;
  className?: string;
  interactive?: boolean;
  onEnter?: () => void;
  onExit?: () => void;
}): React.JSX.Element {
  const mark =
    typeof id === "string"
      ? ({ kind: "builtin", id, label: APP_MARKS[id].label } as const)
      : assignment
        ? resolveAssignmentMark(assignment)
        : null;

  if (!mark) {
    return (
      <MarkTile
        label="Unknown route"
        size={size}
        className={className}
        interactive={interactive}
        onEnter={onEnter}
        onExit={onExit}
      >
        <MonitorSmartphone
          aria-hidden="true"
          className="text-muted-foreground size-4"
        />
      </MarkTile>
    );
  }

  if (mark.kind === "builtin") {
    const builtIn = APP_MARKS[mark.id];

    return (
      <MarkTile
        label={mark.label}
        size={size}
        background={builtIn.bg}
        className={className}
        interactive={interactive}
        onEnter={onEnter}
        onExit={onExit}
      >
        {builtIn.src ? (
          <MarkImage
            src={builtIn.src}
            label={builtIn.label}
            className={builtIn.imageClassName}
          />
        ) : builtIn.art ? (
          <svg
            viewBox="0 0 24 24"
            width={Math.round(size * (builtIn.artScale ?? 0.64))}
            height={Math.round(size * (builtIn.artScale ?? 0.64))}
            aria-hidden="true"
            focusable="false"
          >
            {builtIn.art}
          </svg>
        ) : (
          <MonitorSmartphone
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
        )}
      </MarkTile>
    );
  }

  if (mark.kind === "site") {
    return (
      <MarkTile
        label={mark.label}
        size={size}
        background="transparent"
        className={className}
        interactive={interactive}
        onEnter={onEnter}
        onExit={onExit}
      >
        <Globe aria-hidden="true" className="text-muted-foreground size-4" />
      </MarkTile>
    );
  }

  const initials = initialsFromLabel(mark.label);

  return (
    <MarkTile
      label={mark.label}
      size={size}
      background="transparent"
      className={cn("text-foreground", className)}
      interactive={interactive}
      onEnter={onEnter}
      onExit={onExit}
    >
      {initials === "?" ? (
        <Mail aria-hidden="true" className="text-muted-foreground size-4" />
      ) : (
        <span className="mono text-[10px] tracking-[0.14em]">{initials}</span>
      )}
    </MarkTile>
  );
}

export function AppMark({
  id,
  size = 30,
  className,
}: {
  id: AppMarkId;
  size?: number;
  className?: string;
}): React.JSX.Element {
  return <RouteMark id={id} size={size} className={className} />;
}

/**
 * Marks in display order: apps the user added first, built-in defaults after.
 *
 * Order matters because the facepile truncates. Built-ins are defaults nobody
 * chose; a route you added by hand is the one you'd notice missing, so it
 * should never be the first thing hidden behind "+N". `AppMarkRow` doesn't
 * truncate, but shares the order so the two surfaces don't disagree about a set
 * of icons the user sees in both places.
 */
export function orderedMarkEntries(
  ids: readonly AppMarkId[],
  assignments: readonly CleanupAppAssignment[] = [],
) {
  return [
    // Newest first. Assignments are stored in the order they were added, so
    // reversing puts the app you just routed at the head of the stack, where
    // you'd look to confirm it landed.
    ...[...assignments].reverse().map((assignment) => ({
      key: `${assignment.kind}:${assignment.match}`,
      assignment,
      label: assignment.label,
    })),
    ...ids.map((id) => ({ key: id, id, label: APP_MARKS[id].label }) as const),
  ];
}

export function AppMarkRow({
  ids,
  assignments = [],
  size = 30,
  className,
  trailing,
}: {
  ids: readonly AppMarkId[];
  assignments?: readonly CleanupAppAssignment[];
  size?: number;
  className?: string;
  trailing?: React.ReactNode;
}): React.JSX.Element {
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const entries = orderedMarkEntries(ids, assignments);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {entries.map((entry) => (
          <RouteMark
            key={entry.key}
            id={"id" in entry ? entry.id : undefined}
            assignment={"assignment" in entry ? entry.assignment : undefined}
            size={size}
            interactive
            onEnter={() => setActiveLabel(entry.label)}
            onExit={() => setActiveLabel(null)}
          />
        ))}
        {trailing}
      </div>
      <div className="text-muted-foreground min-h-[16px] text-[11px] leading-none">
        {activeLabel ?? "\u00a0"}
      </div>
    </div>
  );
}

/**
 * Overlapping stack of app marks \u2014 the facepile used on the Tone index rows.
 *
 * Unlike `AppMarkRow` (which lays marks out flat and needs a caption line to
 * name them) this stays a fixed-ish width no matter how many apps route to a
 * destination, so a row with nine apps doesn't push its trailing value off the
 * edge.
 *
 * `max` is 5 rather than 3: every stock destination has at most four apps, so a
 * lower cap spent a hidden app to save ~20px on a row with room to spare.
 * Overflow should start when someone has actually built up routes.
 */
export function AppMarkStack({
  ids,
  assignments = [],
  size = 22,
  max = 5,
  dimmed,
  className,
}: {
  ids: readonly AppMarkId[];
  assignments?: readonly CleanupAppAssignment[];
  size?: number;
  max?: number;
  dimmed?: boolean;
  className?: string;
}): React.JSX.Element | null {
  const entries = orderedMarkEntries(ids, assignments);

  if (entries.length === 0) return null;

  const visible = entries.slice(0, max);
  const hidden = entries.slice(max);

  // "+N" trails the marks it stands for, and gets its own slot rather than
  // scrimming a visible one. Overlaid on a real icon the badge lies: four apps
  // at max = 3 would read "+1" while *two* were unreadable \u2014 the one it covered
  // and the one it counted. Its own slot keeps N equal to what you can't see.
  // It still renders as an app icon (the first hidden one) under a scrim, so
  // the stack reads as one piece rather than a pill bolted on the end.
  const slots = [
    ...visible.map((entry) => ({ ...entry, overflow: 0 })),
    ...(hidden.length > 0
      ? [{ ...hidden[0]!, key: "overflow", overflow: hidden.length }]
      : []),
  ];
  const hiddenLabel = hidden.map((entry) => entry.label).join(", ");

  return (
    // `isolate` keeps the subtree one compositing group, so `dimmed` fades the
    // assembled stack rather than letting each mark's ring go translucent and
    // reveal the mark beneath it.
    <div
      className={cn(
        "isolate flex items-center transition-opacity duration-150",
        // Routed but silent \u2014 the apps still belong here, nothing happens in
        // them. Dimming is the only at-a-glance difference between the two.
        dimmed && "opacity-50",
        className,
      )}
    >
      {slots.map((slot, index) => (
        // No explicit z-index: later siblings paint over earlier ones, so each
        // mark is clipped on its trailing edge and the "+N" at the end stays
        // whole.
        // `bg-card` is what makes a mark occlude the one behind it. Half the
        // marks are transparent tiles holding circular art (Telegram, Slack,
        // Gmail…), so without an opaque backing the neighbour shows through
        // their corners — WhatsApp's green bled up Telegram's left edge. The
        // ring alone can't fix it: the bleed is the whole corner, not 2px.
        <span
          key={slot.key}
          className={cn(
            "bg-card relative inline-flex rounded-[8px]",
            index > 0 && "-ml-[5px]",
          )}
          title={slot.overflow ? hiddenLabel : slot.label}
        >
          {/* The overflow slot borrows a hidden app's artwork, so its mark has
              to be hidden from assistive tech: announcing that app by name
              would present it as visible when it is one of the ones being
              counted. The badge carries the real label instead. */}
          <span aria-hidden={slot.overflow ? "true" : undefined}>
            <RouteMark
              id={"id" in slot ? slot.id : undefined}
              assignment={"assignment" in slot ? slot.assignment : undefined}
              size={size}
              className="ring-card ring-2"
            />
          </span>
          {slot.overflow ? (
            <span
              role="img"
              aria-label={`+${slot.overflow}: ${hiddenLabel}`}
              className="bg-foreground/70 text-background absolute inset-0 flex items-center justify-center rounded-[8px] text-[10px] leading-none font-semibold tabular-nums"
            >
              +{slot.overflow}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
