import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { CloudProfileButton } from "@renderer/components/cloud-profile";
import { Badge } from "@renderer/components/ui/badge";
import { LINKS } from "@renderer/lib/links";
import { cn } from "@renderer/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Book,
  BookOpen,
  CircleHelp,
  Clock,
  Cpu,
  FileText,
  Languages,
  Settings,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SiDiscord, SiGithub } from "react-icons/si";
import { NavLink, Outlet, useNavigate } from "react-router";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut: string;
  /** Renders in the bottom group of the sidebar instead of the top. */
  footer?: boolean;
};

const STATIC_NAV: {
  to: string;
  icon: LucideIcon;
  shortcut: string;
  labelKey: string;
  footer?: boolean;
}[] = [
  { to: "/today", icon: BookOpen, shortcut: "1", labelKey: "shell.nav.today" },
  {
    to: "/settings/history",
    icon: Clock,
    shortcut: "2",
    labelKey: "shell.nav.history",
  },
  {
    to: "/settings/dictionary",
    icon: Book,
    shortcut: "3",
    labelKey: "shell.nav.dictionary",
  },
  {
    to: "/settings/vocabulary",
    icon: Languages,
    shortcut: "4",
    labelKey: "shell.nav.vocabulary",
  },
  {
    to: "/settings/formats",
    icon: FileText,
    shortcut: "5",
    labelKey: "shell.nav.formats",
  },
  {
    to: "/settings/models",
    icon: Cpu,
    shortcut: "6",
    labelKey: "shell.nav.models",
  },
  {
    to: "/settings",
    icon: Settings,
    shortcut: "7",
    labelKey: "shell.nav.settings",
    footer: true,
  },
  {
    to: "/help",
    icon: CircleHelp,
    shortcut: "8",
    labelKey: "shell.nav.help",
    footer: true,
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
            end={item.to === "/settings"}
            className="block"
          >
            {({ isActive }) => (
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-[7px] border px-2.5 py-1.5 text-[13px] transition-colors",
                  isActive
                    ? "border-border bg-card text-foreground font-medium"
                    : "text-secondary-foreground/80 hover:bg-card/50 border-transparent font-normal",
                )}
              >
                <Icon
                  size={14}
                  className={
                    isActive ? "text-primary" : "text-muted-foreground"
                  }
                />
                <span className="flex-1">{item.label}</span>
                <span
                  className={cn(
                    "mono shrink-0 text-[9.5px] tabular-nums",
                    isActive
                      ? "text-muted-foreground/80"
                      : "text-muted-foreground/60",
                  )}
                >
                  {"⌘"}
                  {item.shortcut}
                </span>
              </div>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function AppShell(): React.JSX.Element {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { t } = useTranslation();

  const navItems: NavItem[] = useMemo(
    () =>
      STATIC_NAV.map((item) => ({
        ...item,
        label: t(item.labelKey) as string,
      })),
    [t],
  );
  const mainNav = navItems.filter((item) => !item.footer);
  const footerNav = navItems.filter((item) => item.footer);

  // Cmd/Ctrl+1..9 jumps between sidebar items
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < STATIC_NAV.length) {
        e.preventDefault();
        navigate(STATIC_NAV[idx].to);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  useEffect(() => {
    return window.api?.onFullscreenChanged(setIsFullscreen);
  }, []);

  return (
    <div className="bg-background flex h-screen min-h-0">
      <aside
        className="border-border bg-sidebar flex w-[220px] shrink-0 flex-col border-r"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* Brand row — top padding leaves space for macOS traffic lights */}
        <div
          className={cn(
            "flex items-center gap-2.5 px-3.5 pb-6",
            isFullscreen ? "pt-4" : "pt-[44px]",
          )}
        >
          <img
            src={markLight}
            alt="Freestyle"
            className="block h-7 w-7 dark:hidden"
          />
          <img
            src={markDark}
            alt="Freestyle"
            className="hidden h-7 w-7 dark:block"
          />
          <span className="serif text-foreground text-[19px] font-medium tracking-tight">
            Freestyle
          </span>
          {import.meta.env.DEV && (
            <Badge
              variant="outline"
              className="mono h-4 border-yellow-500/30 bg-yellow-500/15 px-1.5 text-[9px] text-yellow-700 uppercase tracking-[0.12em] dark:text-yellow-300"
            >
              dev
            </Badge>
          )}
        </div>

        <NavList items={mainNav} />
        <div className="flex-1" />
        <NavList items={footerNav} />
        <div
          className="border-sidebar-border mx-3 mt-2 border-t pt-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <CloudProfileButton />
        </div>
        <div className="h-3" />
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="border-border/70 bg-background/92 absolute top-0 right-0 z-40 flex items-center gap-1.5 rounded-bl-[14px] border-b border-l px-3 py-2 shadow-[0_10px_28px_-22px_rgba(0,0,0,0.55)] backdrop-blur-sm"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <a
            href={LINKS.repo}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:bg-card/70 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
          >
            <SiGithub className="h-3.5 w-3.5" />
            Star the repo
          </a>
          <a
            href={LINKS.discord}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Discord"
            className="text-foreground hover:bg-card/70 inline-flex items-center justify-center rounded-md p-1.5 transition-colors"
          >
            <SiDiscord className="h-3.5 w-3.5" />
          </a>
        </div>

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
