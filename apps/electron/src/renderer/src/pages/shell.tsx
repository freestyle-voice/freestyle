import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import { cn } from "@renderer/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Clock,
  Cpu,
  FileText,
  Languages,
  Sliders,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
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
    to: "/settings/shortcuts",
    label: "Shortcuts",
    icon: Zap,
    shortcut: "3",
  },
  {
    to: "/settings/vocabulary",
    label: "Vocabulary",
    icon: Languages,
    shortcut: "4",
  },
  {
    to: "/settings/formats",
    label: "Formats",
    icon: FileText,
    shortcut: "5",
  },
  { to: "/settings/models", label: "Models", icon: Cpu, shortcut: "6" },
  { to: "/settings", label: "Settings", icon: Sliders, shortcut: "7" },
];

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

        <nav
          className="flex flex-col gap-px px-3"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {navItems.map((item) => {
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
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
