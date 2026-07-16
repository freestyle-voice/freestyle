import { DragSpacer } from "@renderer/components/drag-spacer";
import { listPlugins } from "@renderer/lib/plugins-api";
import type { PluginViewBounds } from "@shared/plugins";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";

/** Design tokens forwarded to plugin pages so they can match the app's theme. */
const FORWARDED_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--border",
  "--input",
  "--ring",
  "--radius",
];

function readTokens(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const name of FORWARDED_TOKENS) {
    const value = styles.getPropertyValue(name).trim();
    if (value) tokens[name] = value;
  }
  return tokens;
}

/**
 * Hosts a plugin's UI page. The page itself renders in a sandboxed
 * WebContentsView managed by the main process; this component only renders a
 * placeholder, reports its bounds so the native view can overlay it precisely,
 * and tears the view down on unmount.
 */
export default function PluginPage(): React.JSX.Element {
  const { slug, pageId } = useParams<{
    slug: string;
    pageId: string;
  }>();
  const navigate = useNavigate();
  const placeholderRef = useRef<HTMLDivElement>(null);

  // The server serves the page by its entry path; resolve it from the plugin
  // list (cached by the hub, refetched here on a direct navigation).
  const { data: plugins } = useQuery({
    queryKey: ["plugins"],
    queryFn: () => listPlugins(),
  });
  const entry = plugins
    ?.find((p) => p.slug === slug)
    ?.pages.find((p) => p.id === pageId)?.entry;

  // Show the native view and keep its bounds in sync with the placeholder.
  useLayoutEffect(() => {
    if (!slug || !pageId || !entry) return;
    const el = placeholderRef.current;
    if (!el) return;

    const measure = (): PluginViewBounds => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };

    void window.api.showPluginView(
      slug,
      pageId,
      entry,
      measure(),
      readTokens(),
    );

    const sync = (): void => window.api.setPluginViewBounds(measure());
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener("resize", sync);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
      window.api.hidePluginView();
    };
  }, [slug, pageId, entry]);

  // Plugin pages can ask the host to navigate (e.g. back to the hub).
  useEffect(() => {
    return window.api.onPluginNavigate((to) => navigate(to));
  }, [navigate]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DragSpacer />
      <div ref={placeholderRef} className="flex-1" />
    </div>
  );
}
