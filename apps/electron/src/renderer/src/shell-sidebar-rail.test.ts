import { BookOpen, CalendarClock, Puzzle, Settings } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { TooltipProvider } from "./components/ui/tooltip";
import { RailAction, RailNav } from "./shell-sidebar-rail";

function renderAt(path: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        TooltipProvider,
        null,
        createElement(RailNav, {
          label: "Dictate navigation",
          items: [
            { to: "/today", label: "History", icon: BookOpen },
            { to: "/plugins", label: "Plugins", icon: Puzzle },
            {
              to: "/plugins/example/page",
              label: "Example plugin",
              icon: Puzzle,
            },
            { to: "/settings", label: "Settings", icon: Settings },
          ],
        }),
      ),
    ),
  );
}

describe("compact sidebar navigation", () => {
  it("keeps labeled links and native keyboard targets while hiding icon artwork from assistive technology", () => {
    const html = renderAt("/today");
    expect(html).toContain('aria-label="Dictate navigation"');
    expect(html).toMatch(/<a[^>]*aria-label="History"[^>]*href="\/today"/);
    expect(html).toMatch(/aria-label="History"[^>]*aria-current="page"/);
    expect(html).toContain('aria-label="Example plugin"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-slot="tooltip-trigger"');
    expect(html).not.toContain('tabindex="-1"');
  });

  it("marks Settings active for nested settings but keeps only the actual plugin destination active", () => {
    const settings = renderAt("/settings/appearance");
    expect(settings).toMatch(/aria-label="Settings"[^>]*aria-current="page"/);
    const plugin = renderAt("/plugins/example/page");
    expect(plugin).toMatch(
      /aria-label="Example plugin"[^>]*aria-current="page"/,
    );
    expect(plugin).not.toMatch(/aria-label="Plugins"[^>]*aria-current/);
  });

  it("exposes the current Remix surface and preserves unavailable action state", () => {
    const html = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(RailAction, {
          icon: CalendarClock,
          label: "Schedules",
          current: true,
          disabled: true,
        }),
      ),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Schedules"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('disabled=""');
  });
});
