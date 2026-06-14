import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { LINKS } from "@renderer/lib/links";
import { cn } from "@renderer/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Book,
  BookOpen,
  Clock,
  Cpu,
  FileText,
  HelpCircle,
  Languages,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SiDiscord, SiGithub } from "react-icons/si";
import { NavLink, Outlet, useNavigate } from "react-router";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut: string;
};

const navItems: NavItem[] = [
  { to: "/today", label: "Today", icon: BookOpen, shortcut: "1" },
  { to: "/settings/history", label: "History", icon: Clock, shortcut: "2" },
  {
    to: "/settings/dictionary",
    label: "Dictionary",
    icon: Book,
    shortcut: "3",
  },
  {
    to: "/settings/vocabulary",
    label: "Vocabulary",
    icon: Languages,
    shortcut: "4",
  },
  { to: "/settings/formats", label: "Formats", icon: FileText, shortcut: "5" },
  { to: "/settings/models", label: "Models", icon: Cpu, shortcut: "6" },
  { to: "/settings", label: "Settings", icon: Settings, shortcut: "7" },
  { to: "/help", label: "Help", icon: HelpCircle, shortcut: "8" },
];

const PRIMARY_COUNT = 6;

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

  // Cmd/Ctrl+1..9 jumps between sidebar items
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < navItems.length) {
        e.preventDefault();
        navigate(navItems[idx].to);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  useEffect(() => {
    return window.api?.onFullscreenChanged(setIsFullscreen);
  }, []);

  return (
    <div className="bg-background flex h-screen">
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
        </div>

        <NavList items={navItems.slice(0, PRIMARY_COUNT)} />
        <div className="flex-1" />
        <NavList items={navItems.slice(PRIMARY_COUNT)} />
        <div className="h-3" />
      </aside>

      <div className="relative min-h-0 min-w-0 flex-1">
        <div
          className="absolute right-3 top-2.5 z-20 flex items-center gap-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <a
            href={LINKS.repo}
            target="_blank"
            rel="noopener noreferrer"
            className="border-transparent hover:border-border hover:bg-card text-foreground inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
          >
            <SiGithub className="h-3.5 w-3.5" />
            Star the repo
          </a>
          <a
            href={LINKS.discord}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our Discord"
            className="border-transparent hover:border-border hover:bg-card text-foreground inline-flex items-center justify-center rounded-md border p-1.5 transition-colors"
          >
            <SiDiscord className="h-3.5 w-3.5" />
          </a>
        </div>

        <main className="min-h-0 h-full overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
