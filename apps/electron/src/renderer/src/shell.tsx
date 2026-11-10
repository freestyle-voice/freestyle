import "./shell.css";

import {
  CloudProfileButton,
  SignInCtaCard,
  UpgradeCtaCard,
} from "@renderer/components/cloud-profile";
import { Badge } from "@renderer/components/ui/badge";
import { UpdateBanner } from "@renderer/components/update-banner";
import { usePersistentState } from "@renderer/hooks/use-persistent-state";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { IS_MAC, MOD_LABEL } from "@renderer/lib/platform";
import { listPlugins } from "@renderer/lib/plugins-api";
import { queryKeys } from "@renderer/lib/query";
import {
  isSidebarVisibility,
  SIDEBAR_VISIBILITY_STORAGE_KEY,
  type SidebarVisibility,
} from "@renderer/lib/sidebar-visibility";
import { cn } from "@renderer/lib/utils";
import {
  pluginDisplayName,
  resolvePluginIcon,
} from "@renderer/pages/plugins/helpers";
import type { PluginInfo } from "@shared/plugins";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Book,
  BookOpen,
  CircleHelp,
  Cpu,
  CreditCard,
  Database,
  FileText,
  LogIn,
  Mic,
  Network,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { RailAction, RailNav } from "./shell-sidebar-rail";

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
    to: "/vocabulary",
    icon: Book,
    labelKey: "shell.nav.vocabulary",
  },
  {
    to: "/dictionary",
    icon: Zap,
    labelKey: "shell.nav.dictionary",
  },
  {
    to: "/tone",
    icon: FileText,
    labelKey: "shell.nav.tone",
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
    items: [{ to: "/settings/transcription", label: "Dictation", icon: Mic }],
  },
  {
    label: "General",
    items: [
      { to: "/settings/models", label: "Models", icon: Cpu },
      { to: "/settings/appearance", label: "Appearance", icon: Paintbrush },
      { to: "/settings/application", label: "Application", icon: Settings },
      { to: "/settings/network", label: "Network", icon: Network },
      { to: "/settings/permissions", label: "Permissions", icon: ShieldCheck },
      { to: "/settings/data", label: "Data", icon: Database },
      { to: "/settings/billing", label: "Usage & billing", icon: CreditCard },
    ],
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

function SidebarFooter({ items }: { items: NavItem[] }): React.JSX.Element {
  const { user, phase } = useCloudAuth();

  return (
    <div className="shrink-0 pb-3">
      <UpgradeCtaCard />
      <div className="border-sidebar-border mx-3 mt-2 mb-2 border-t" />
      {user || phase === "checking" ? (
        <div
          className="mx-3"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <CloudProfileButton />
        </div>
      ) : (
        <NavList items={items} />
      )}
    </div>
  );
}

function SettingsSidebar({
  onBack,
  onHideSidebar,
  toggleRef,
}: {
  toggleRef?: React.RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onHideSidebar: () => void;
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
    <div className="flex min-h-0 flex-1 flex-col" data-workspace="dictate">
      <div
        className="px-4 pt-2 pb-3"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] transition-colors"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to app
          </button>
          <SidebarVisibilityToggle
            onClick={onHideSidebar}
            buttonRef={toggleRef}
          />
        </div>
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

function SidebarVisibilityToggle({
  onClick,
  buttonRef,
}: {
  onClick: () => void;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="sidebar-visibility-toggle"
      aria-label="Hide sidebar"
      title="Hide sidebar"
      onClick={onClick}
    >
      <PanelLeftClose aria-hidden="true" />
    </button>
  );
}

function SidebarRailAccount(): React.JSX.Element {
  const { user, phase, signIn, signingIn } = useCloudAuth();
  return user ? (
    <RailNav
      label="Account"
      items={[{ to: "/profile", label: "Profile", icon: UserRound }]}
    />
  ) : (
    <RailAction
      label={phase === "checking" ? "Loading profile" : "Sign in"}
      icon={LogIn}
      disabled={phase === "checking" || signingIn}
      onClick={() => void signIn()}
    />
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
  const [dismissedSignInCard, setDismissedSignInCard] = useState(false);
  const isOnboardingRoute = location.pathname === "/onboarding";
  const isSettingsRoute =
    location.pathname === "/settings" ||
    location.pathname.startsWith("/settings/");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sidebarRevealRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
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
  const [sidebarVisibility, setSidebarVisibility] =
    usePersistentState<SidebarVisibility>(
      SIDEBAR_VISIBILITY_STORAGE_KEY,
      "visible",
      isSidebarVisibility,
    );
  const isSidebarHidden = sidebarVisibility === "hidden";
  const hideSidebar = useCallback(() => {
    setSidebarVisibility("hidden");
    requestAnimationFrame(() => sidebarRevealRef.current?.focus());
  }, [setSidebarVisibility]);
  const showSidebar = useCallback(() => {
    setSidebarVisibility("visible");
    requestAnimationFrame(() => sidebarToggleRef.current?.focus());
  }, [setSidebarVisibility]);

  useEffect(() => {
    window.api.setPanelSidebarHidden(isSidebarHidden);
  }, [isSidebarHidden]);

  useEffect(
    () =>
      window.api.onDashboardNavigate((route) => {
        navigate(route);
      }),
    [navigate],
  );

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
      if (isSettingsRoute || isOnboardingRoute) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < staticNav.length) {
        e.preventDefault();
        navigate(staticNav[idx].to);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSettingsRoute, isOnboardingRoute, navigate, staticNav]);

  return (
    <div className="glass-window-shell flex h-screen min-h-0">
      {isOnboardingRoute ? null : !isSidebarHidden ? (
        <>
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
                IS_MAC && !isFullscreen ? "h-8" : "h-0",
              )}
            />
            {isSettingsRoute ? (
              <SettingsSidebar
                onBack={() => navigate("/today")}
                onHideSidebar={hideSidebar}
                toggleRef={sidebarToggleRef}
              />
            ) : (
              <>
                <div
                  className="sidebar-titlebar"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <span className="text-foreground text-[17px] font-semibold">
                    Dictate
                  </span>
                  {import.meta.env.DEV && (
                    <span className="dev-badge" title="Development build">
                      DEV
                    </span>
                  )}
                  <SidebarVisibilityToggle
                    onClick={hideSidebar}
                    buttonRef={sidebarToggleRef}
                  />
                </div>

                <div
                  className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  <NavList items={mainNav} />
                  {pluginNav.length > 0 ? (
                    <>
                      <div className="border-sidebar-border mx-3 my-1.5 border-t" />
                      <NavList items={pluginNav} />
                    </>
                  ) : null}
                </div>
                {!dismissedSignInCard ? (
                  <SignInCtaCard
                    onDismiss={() => setDismissedSignInCard(true)}
                  />
                ) : null}
                <SidebarFooter items={footerNav} />
              </>
            )}
          </aside>
          <SidebarResizeHandle
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
          />
        </>
      ) : (
        <aside
          className="glass-sidebar glass-sidebar--collapsed"
          aria-label="Compact sidebar"
          data-workspace="dictate"
        >
          <div
            className={cn(
              "sidebar-rail-chrome",
              IS_MAC && !isFullscreen && "sidebar-rail-chrome--mac",
            )}
            aria-hidden="true"
          />
          <div className="sidebar-rail-group sidebar-rail-header">
            <RailAction
              label="Show sidebar"
              icon={PanelLeftOpen}
              ref={sidebarRevealRef}
              onClick={showSidebar}
            />
          </div>
          <div className="sidebar-rail-navigation no-scrollbar">
            <RailNav label="Dictate navigation" items={mainNav} />
            {pluginNav.length > 0 ? (
              <div className="sidebar-rail-divider" />
            ) : null}
            <RailNav label="Plugin navigation" items={pluginNav} />
          </div>
          <div className="sidebar-rail-footer sidebar-rail-group">
            <RailNav label="App navigation" items={footerNav} />
            <SidebarRailAccount />
          </div>
        </aside>
      )}

      <div className="glass-content relative z-0 flex min-h-0 min-w-0 flex-1 flex-col">
        <ContentTitlebar
          sidebarCollapsed={
            (isSidebarHidden || isOnboardingRoute) && !isFullscreen
          }
        />
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

/** The collapsed rail leaves room for macOS traffic lights above the content. */
function ContentTitlebar({
  sidebarCollapsed,
}: {
  sidebarCollapsed: boolean;
}): React.JSX.Element | null {
  if (!IS_MAC) return null;

  return (
    <div
      className={cn(
        "glass-content-titlebar",
        sidebarCollapsed && "glass-content-titlebar--sidebar-collapsed",
      )}
      aria-hidden="true"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    />
  );
}
