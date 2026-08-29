import "./shell.css";

import {
  CloudProfileButton,
  UpgradeCtaCard,
} from "@renderer/components/cloud-profile";
import { useRemixSession } from "@renderer/components/remix-session-context";
import { ThreadHistory } from "@renderer/components/thread-history";
import { Badge } from "@renderer/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { UpdateBanner } from "@renderer/components/update-banner";
import { usePersistentState } from "@renderer/hooks/use-persistent-state";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { MOD_LABEL } from "@renderer/lib/platform";
import { listPlugins } from "@renderer/lib/plugins-api";
import { queryKeys } from "@renderer/lib/query";
import { cn } from "@renderer/lib/utils";
import {
  DEFAULT_WORKSPACE,
  isWorkspace,
  WORKSPACE_STORAGE_KEY,
  type Workspace,
  workspaceForAppPath,
  workspaceHomeRoute,
} from "@renderer/lib/workspace";
import {
  pluginDisplayName,
  resolvePluginIcon,
} from "@renderer/pages/plugins/helpers";
import type { PluginInfo } from "@shared/plugins";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Bell,
  Book,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Cpu,
  CreditCard,
  Database,
  FileText,
  Mic,
  Network,
  Paintbrush,
  PlugZap,
  Plus,
  Puzzle,
  Search,
  Settings,
  ShieldCheck,
  Wand2,
  Zap,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Keyboard shortcut digit (e.g. "1" for Cmd+1). Omit for plugin items. */
  shortcut?: string;
  /** Renders in the bottom group of the sidebar instead of the top. */
  footer?: boolean;
  /** Whether this is a local dev plugin (shows a "Dev" badge). */
  isDev?: boolean;
};

const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 360;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width));
}

const STATIC_NAV: {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  footer?: boolean;
}[] = [
  { to: "/today", icon: BookOpen, labelKey: "shell.nav.today" },
  {
    to: "/settings/vocabulary",
    icon: Book,
    labelKey: "shell.nav.vocabulary",
  },
  {
    to: "/settings/dictionary",
    icon: Zap,
    labelKey: "shell.nav.dictionary",
  },
  {
    to: "/settings/tone",
    icon: FileText,
    labelKey: "shell.nav.tone",
  },
  {
    to: "/settings/models",
    icon: Cpu,
    labelKey: "shell.nav.models",
  },
  {
    to: "/plugins",
    icon: Puzzle,
    labelKey: "shell.nav.plugins",
  },
  {
    to: "/settings",
    icon: Settings,
    labelKey: "shell.nav.settings",
    footer: true,
  },
  {
    to: "/help",
    icon: CircleHelp,
    labelKey: "shell.nav.help",
    footer: true,
  },
];

const SETTINGS_NAV_GROUPS: {
  label: string;
  items: { to: string; label: string; icon: LucideIcon }[];
}[] = [
  {
    label: "Dictation",
    items: [
      { to: "/settings/transcription", label: "Transcription", icon: Mic },
      { to: "/settings/vocabulary", label: "Vocabulary", icon: Book },
      { to: "/settings/dictionary", label: "Dictionary", icon: Zap },
      { to: "/settings/tone", label: "Tone", icon: FileText },
      { to: "/settings/models", label: "Models", icon: Cpu },
    ],
  },
  {
    label: "Remix",
    items: [
      { to: "/settings/remix", label: "Remix", icon: Wand2 },
      { to: "/settings/apps", label: "Connected apps", icon: PlugZap },
      { to: "/settings/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Desktop",
    items: [
      { to: "/settings/appearance", label: "Appearance", icon: Paintbrush },
      { to: "/settings/application", label: "Application", icon: Settings },
      { to: "/settings/network", label: "Network", icon: Network },
      { to: "/settings/permissions", label: "Permissions", icon: ShieldCheck },
      { to: "/settings/data", label: "Data", icon: Database },
      { to: "/settings/billing", label: "Usage & billing", icon: CreditCard },
    ],
  },
  {
    label: "Extensions",
    items: [{ to: "/plugins", label: "Plugins", icon: Puzzle }],
  },
];

function NavList({ items }: { items: NavItem[] }): React.JSX.Element {
  return (
    <nav
      className="flex flex-col gap-px px-3"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/settings" || item.to === "/plugins"}
            className="block"
          >
            {({ isActive }) => (
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-[7px] border px-2.5 py-1.5 text-[13px] transition-colors",
                  isActive
                    ? "glass-nav-active text-foreground font-medium"
                    : "text-secondary-foreground/80 hover:bg-card/50 border-transparent font-normal",
                )}
              >
                <Icon
                  size={14}
                  className={
                    isActive ? "text-primary" : "text-muted-foreground"
                  }
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.isDev ? (
                  <Badge
                    variant="outline"
                    className="mono h-4 shrink-0 border-yellow-500/30 bg-yellow-500/15 px-1 text-[9px] text-yellow-700 uppercase tracking-[0.12em] dark:text-yellow-300"
                  >
                    dev
                  </Badge>
                ) : null}
                {item.shortcut ? (
                  <span
                    className={cn(
                      "mono shrink-0 text-[9.5px] tabular-nums",
                      isActive
                        ? "text-muted-foreground/80"
                        : "text-muted-foreground/60",
                    )}
                  >
                    {MOD_LABEL}
                    {item.shortcut}
                  </span>
                ) : null}
              </div>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function SettingsSidebar({
  workspace,
  onBack,
}: {
  workspace: Workspace;
  onBack: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const groups = SETTINGS_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        !normalizedQuery ||
        `${group.label} ${item.label}`.toLowerCase().includes(normalizedQuery),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-workspace={workspace}>
      <div className="px-4 pt-2 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to app
        </button>
        <p className="text-foreground mt-3 px-1 text-[17px] font-semibold tracking-[-0.02em]">
          Settings
        </p>
        <label className="border-border bg-card/55 text-muted-foreground mt-3 flex h-8 items-center gap-2 rounded-[8px] border px-2.5 focus-within:border-primary/70">
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Search settings</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <nav
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        aria-label="Settings"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {groups.map((group) => (
          <section key={group.label} className="mb-4 last:mb-0">
            <h2 className="text-muted-foreground mono mb-1.5 px-2 text-[9px] font-semibold tracking-[0.14em] uppercase">
              {group.label}
            </h2>
            <div className="flex flex-col gap-px">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/plugins"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 rounded-[7px] border px-2 py-1.5 text-[12px] transition-colors",
                        isActive
                          ? "glass-nav-active text-foreground font-medium"
                          : "border-transparent text-secondary-foreground/80 hover:bg-card/50",
                      )
                    }
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </section>
        ))}
        {groups.length === 0 ? (
          <p className="text-muted-foreground px-2 pt-2 text-[11.5px]">
            No settings found.
          </p>
        ) : null}
      </nav>
    </div>
  );
}

function RemixSidebarSessions({
  searchQuery,
}: {
  searchQuery: string;
}): React.JSX.Element | null {
  const { thread, switchThread, startNewThread, localTitles } =
    useRemixSession();
  const listRef = useRef<HTMLDivElement>(null);
  const [hasMoreSessions, setHasMoreSessions] = useState(false);

  const updateMoreSessionsState = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    setHasMoreSessions(
      list.scrollTop + list.clientHeight < list.scrollHeight - 1,
    );
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    let frame = requestAnimationFrame(updateMoreSessionsState);
    const scheduleUpdate = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateMoreSessionsState);
    };
    const mutationObserver = new MutationObserver(scheduleUpdate);
    const resizeObserver = new ResizeObserver(scheduleUpdate);

    list.addEventListener("scroll", updateMoreSessionsState, {
      passive: true,
    });
    mutationObserver.observe(list, { childList: true, subtree: true });
    resizeObserver.observe(list);

    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener("scroll", updateMoreSessionsState);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [updateMoreSessionsState]);

  if (!thread) return null;

  return (
    <section className="remix-sidebar-sessions" aria-label="Remix chats">
      <div className="remix-sidebar-sessions-head">
        <button
          type="button"
          className="remix-sidebar-new"
          onClick={startNewThread}
        >
          <Plus aria-hidden="true" />
          New chat
        </button>
      </div>
      <div
        ref={listRef}
        className="remix-sidebar-sessions-list"
        data-has-more={hasMoreSessions || undefined}
      >
        <ThreadHistory
          currentId={thread.id}
          searchQuery={searchQuery}
          titleOverrides={localTitles}
          onPick={(picked) => {
            if (picked.id !== thread.id) switchThread(picked);
          }}
        />
      </div>
    </section>
  );
}

function WorkspaceSwitcher({
  workspace,
  onWorkspaceChange,
}: {
  workspace: Workspace;
  onWorkspaceChange: (workspace: Workspace) => void;
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="remix-workspace-switcher"
          aria-label="Switch workspace"
        >
          {workspace === "remix" ? "Remix" : "Dictate"}
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60 rounded-[10px] p-1.5" align="start">
        <DropdownMenuRadioGroup
          value={workspace}
          onValueChange={(value) =>
            onWorkspaceChange(value as "remix" | "dictate")
          }
        >
          <DropdownMenuRadioItem
            value="dictate"
            className="items-start gap-2.5 rounded-[7px] px-2 py-2"
          >
            <Mic className="mt-0.5 size-3.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] font-medium">Dictate</span>
              <span className="text-muted-foreground text-[10.5px] leading-snug">
                Dictate into the app you're using
              </span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="remix"
            className="items-start gap-2.5 rounded-[7px] px-2 py-2"
          >
            <Wand2 className="mt-0.5 size-3.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] font-medium">Remix</span>
              <span className="text-muted-foreground text-[10.5px] leading-snug">
                Chat, automate, and work with your apps
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SessionSearchDialog({
  open,
  onOpenChange,
  query,
  onQueryChange,
  inputRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}): React.JSX.Element | null {
  const { thread, switchThread } = useRemixSession();
  if (!thread) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(12,11,8,0.62)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="remix-session-search-dialog"
        >
          <DialogPrimitive.Title className="sr-only">
            Search Remix chats
          </DialogPrimitive.Title>
          <label className="remix-session-search-input">
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search sessions"
              aria-label="Search sessions"
            />
            <kbd>Esc</kbd>
          </label>
          <div className="remix-session-search-results">
            <ThreadHistory
              currentId={thread.id}
              searchQuery={query}
              onPick={(picked) => {
                if (picked.id !== thread.id) switchThread(picked);
                onOpenChange(false);
              }}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SidebarResizeHandle({
  width,
  onWidthChange,
}: {
  width: number;
  onWidthChange: (width: number) => void;
}): React.JSX.Element {
  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;

      event.preventDefault();
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = width;
      handle.setPointerCapture(event.pointerId);

      const onMove = (moveEvent: PointerEvent): void => {
        onWidthChange(Math.round(startWidth + moveEvent.clientX - startX));
      };
      const onFinish = (finishEvent: PointerEvent): void => {
        if (handle.hasPointerCapture(finishEvent.pointerId)) {
          handle.releasePointerCapture(finishEvent.pointerId);
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onFinish);
        window.removeEventListener("pointercancel", onFinish);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onFinish);
      window.addEventListener("pointercancel", onFinish);
    },
    [onWidthChange, width],
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> cannot be a focusable, draggable window splitter
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      onPointerDown={onResizeStart}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onWidthChange(width - 16);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onWidthChange(width + 16);
        } else if (event.key === "Home") {
          event.preventDefault();
          onWidthChange(SIDEBAR_WIDTH_MIN);
        } else if (event.key === "End") {
          event.preventDefault();
          onWidthChange(SIDEBAR_WIDTH_MAX);
        }
      }}
      className="group relative z-10 -ml-px flex w-px shrink-0 cursor-col-resize items-center justify-center outline-none before:absolute before:inset-y-0 before:-left-1.5 before:w-4"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <span className="bg-primary/60 group-hover:bg-primary group-focus-visible:bg-primary h-10 w-px rounded-full opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100" />
    </div>
  );
}

/** Derive sidebar nav items from installed plugins that have UI pages. */
function usePluginNavItems(plugins: PluginInfo[]): NavItem[] {
  return useMemo(() => {
    const items: NavItem[] = [];
    for (const plugin of plugins) {
      if (!plugin.enabled || plugin.missing) continue;
      for (const page of plugin.pages) {
        items.push({
          to: `/plugins/${plugin.slug}/${page.id}`,
          label:
            plugin.pages.length === 1 ? pluginDisplayName(plugin) : page.title,
          icon: resolvePluginIcon(page.icon ?? plugin.icon),
          isDev: plugin.slug.endsWith("-dev"),
        });
      }
    }
    return items;
  }, [plugins]);
}

export default function AppShell(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { user } = useCloudAuth();
  const isRemixRoute = location.pathname === "/remix";
  const isSettingsRoute =
    location.pathname === "/settings" ||
    location.pathname.startsWith("/settings/") ||
    location.pathname === "/plugins" ||
    location.pathname.startsWith("/plugins/");
  const [sidebarWorkspace, setSidebarWorkspace] = usePersistentState<Workspace>(
    WORKSPACE_STORAGE_KEY,
    isRemixRoute ? "remix" : DEFAULT_WORKSPACE,
    isWorkspace,
  );
  // Browser/Electron can restore a previous hash route before local storage
  // hydrates. Derive the visible workspace from that route synchronously so a
  // Dictate sidebar never appears next to the Remix chat (or vice versa).
  const routeWorkspace = workspaceForAppPath(location.pathname);
  const activeWorkspace = routeWorkspace ?? sidebarWorkspace;
  const isRemixSidebar = activeWorkspace === "remix";
  const [remixSessionSearch, setRemixSessionSearch] = useState("");
  const [isSessionSearchOpen, setIsSessionSearchOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sessionSearchRef = useRef<HTMLInputElement>(null);
  const [sidebarWidthRaw, setSidebarWidthRaw] = usePersistentState<string>(
    "shell.sidebarWidth",
    "220",
    (value): value is string => /^\d+$/.test(value),
  );
  const sidebarWidth = clampSidebarWidth(Number(sidebarWidthRaw) || 220);
  const setSidebarWidth = useCallback(
    (width: number) => setSidebarWidthRaw(String(clampSidebarWidth(width))),
    [setSidebarWidthRaw],
  );

  const changeWorkspace = useCallback(
    (workspace: Workspace) => {
      setSidebarWorkspace(workspace);
      navigate(workspaceHomeRoute(workspace));
    },
    [navigate, setSidebarWorkspace],
  );

  // Keep the persisted selection in sync after direct navigation, while
  // retaining it unchanged for Settings and plugin routes.
  useEffect(() => {
    if (routeWorkspace && routeWorkspace !== sidebarWorkspace) {
      setSidebarWorkspace(routeWorkspace);
    }
  }, [routeWorkspace, setSidebarWorkspace, sidebarWorkspace]);

  useEffect(() => {
    if (!isRemixSidebar) {
      setIsSessionSearchOpen(false);
      setRemixSessionSearch("");
    }
  }, [isRemixSidebar]);

  const handleSessionSearchOpenChange = useCallback((open: boolean) => {
    setIsSessionSearchOpen(open);
    if (!open) setRemixSessionSearch("");
  }, []);

  useEffect(() => {
    if (!isSessionSearchOpen) return;
    const frame = requestAnimationFrame(() =>
      sessionSearchRef.current?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [isSessionSearchOpen]);

  useEffect(() => window.api.onFullscreenChanged(setIsFullscreen), []);

  const { data: plugins = [] } = useQuery({
    queryKey: queryKeys.plugins,
    queryFn: () => listPlugins(),
  });

  const pluginNav = usePluginNavItems(plugins);

  const staticNav = useMemo(
    () =>
      STATIC_NAV.map((item, idx) => ({ ...item, shortcut: String(idx + 1) })),
    [],
  );

  const navItems: NavItem[] = useMemo(
    () =>
      staticNav.map((item) => ({
        ...item,
        label: t(item.labelKey) as string,
      })),
    [staticNav, t],
  );
  const mainNav = navItems.filter((item) => !item.footer);
  const footerNav = navItems.filter((item) => item.footer);

  // Cmd/Ctrl+1..9 jumps between sidebar items
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isSettingsRoute) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < staticNav.length) {
        e.preventDefault();
        navigate(staticNav[idx].to);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSettingsRoute, navigate, staticNav]);

  return (
    <div className="glass-window-shell flex h-screen min-h-0">
      <aside
        className="glass-sidebar flex min-h-0 shrink-0 flex-col border-r"
        style={
          {
            WebkitAppRegion: "drag",
            flexBasis: sidebarWidth,
            width: sidebarWidth,
          } as React.CSSProperties
        }
      >
        <div
          className={cn(
            "shrink-0 transition-[height] duration-150",
            isFullscreen ? "h-0" : "h-8",
          )}
        />
        {isSettingsRoute ? (
          <SettingsSidebar
            workspace={sidebarWorkspace}
            onBack={() => navigate(workspaceHomeRoute(sidebarWorkspace))}
          />
        ) : (
          <>
            <div
              className="remix-sidebar-titlebar"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <WorkspaceSwitcher
                workspace={activeWorkspace}
                onWorkspaceChange={changeWorkspace}
              />
              {import.meta.env.DEV && (
                <Badge
                  variant="outline"
                  className="mono h-5 border-yellow-500/30 bg-yellow-500/15 px-1.5 text-[9px] text-yellow-700 uppercase tracking-[0.12em] dark:text-yellow-300"
                >
                  dev
                </Badge>
              )}
              {isRemixSidebar ? (
                <button
                  type="button"
                  aria-label="Search sessions"
                  title="Search sessions"
                  onClick={() => handleSessionSearchOpenChange(true)}
                  className="remix-session-search-trigger"
                >
                  <Search aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              {isRemixSidebar ? (
                <RemixSidebarSessions searchQuery="" />
              ) : (
                <>
                  <NavList items={mainNav} />
                  {pluginNav.length > 0 ? (
                    <>
                      <div className="border-sidebar-border mx-3 my-1.5 border-t" />
                      <NavList items={pluginNav} />
                    </>
                  ) : null}
                </>
              )}
            </div>
            {!isRemixSidebar && !user ? (
              <>
                {pluginNav.length > 0 ? (
                  <div className="border-sidebar-border mx-3 my-1.5 border-t" />
                ) : null}
                <NavList items={footerNav} />
              </>
            ) : null}
            <UpgradeCtaCard />
            <div
              className="border-sidebar-border mx-3 mt-2 border-t pt-2"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <CloudProfileButton />
            </div>
            <div className="h-3" />
          </>
        )}
      </aside>
      <SidebarResizeHandle
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
      />

      {isRemixSidebar ? (
        <SessionSearchDialog
          open={isSessionSearchOpen}
          onOpenChange={handleSessionSearchOpenChange}
          query={remixSessionSearch}
          onQueryChange={setRemixSessionSearch}
          inputRef={sessionSearchRef}
        />
      ) : null}

      <div className="glass-content relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">
        <UpdateBanner className="relative z-50 mt-4 w-[calc(100%-3rem)] max-w-2xl self-center" />

        <main
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ scrollbarWidth: "none" } as React.CSSProperties}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
