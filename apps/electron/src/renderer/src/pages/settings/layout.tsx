import markDark from "@renderer/assets/mark-dark.svg";
import markLight from "@renderer/assets/mark-light.svg";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@renderer/components/ui/sidebar";
import {
  Book,
  Clock,
  Cpu,
  FileText,
  MessageSquare,
  Shield,
  Sliders,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

const navItems = [
  { to: "/settings/general", label: "General", icon: Sliders, shortcut: "1" },
  { to: "/settings/models", label: "Models", icon: Cpu, shortcut: "2" },
  {
    to: "/settings/dictionary",
    label: "Dictionary",
    icon: Book,
    shortcut: "3",
  },
  {
    to: "/settings/formats",
    label: "Formats",
    icon: FileText,
    shortcut: "4",
  },
  { to: "/settings/history", label: "History", icon: Clock, shortcut: "5" },
  {
    to: "/settings/permissions",
    label: "Permissions",
    icon: Shield,
    shortcut: "6",
  },
  {
    to: "/settings/feedback",
    label: "Feedback",
    icon: MessageSquare,
    shortcut: "7",
  },
];

export default function SettingsLayout(): React.JSX.Element {
  const navigate = useNavigate();

  // Keyboard shortcuts: Cmd/Ctrl+1-7 for nav
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

  return (
    <SidebarProvider className="bg-background h-screen">
      <Sidebar collapsible="none" className="border-sidebar-border border-r">
        {/* Drag region for macOS traffic lights */}
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <SidebarHeader className="flex flex-row items-center gap-2.5 px-4 py-2">
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
          <span className="serif text-lg font-semibold tracking-tight">
            Freestyle
          </span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Preferences</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.to}>
                        {({ isActive }) => (
                          <>
                            <item.icon
                              className={isActive ? "text-primary" : ""}
                            />
                            <span className={isActive ? "font-medium" : ""}>
                              {item.label}
                            </span>
                            <span className="text-muted-foreground/50 ml-auto font-mono text-[10px]">
                              {"\u2318"}
                              {item.shortcut}
                            </span>
                          </>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="flex-1 overflow-auto">
        {/* Drag region for the content area */}
        <div
          className="h-9 shrink-0"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="px-6 pb-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
