import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@renderer/components/ui/tooltip";
import { cn } from "@renderer/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactElement } from "react";
import { NavLink } from "react-router";

/** Keep the same accessible label on the icon and its hover/focus tooltip. */
export function RailTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function RailAction({
  label,
  icon: Icon,
  current = false,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: string;
  icon: LucideIcon;
  current?: boolean;
}): React.JSX.Element {
  return (
    <RailTooltip label={label}>
      <button
        {...props}
        type="button"
        className={cn("sidebar-rail-button", className)}
        aria-label={label}
        aria-current={current ? "page" : undefined}
      >
        <Icon aria-hidden="true" />
      </button>
    </RailTooltip>
  );
}

export function RailNav({
  items,
  label,
}: {
  items: { to: string; label: string; icon: LucideIcon }[];
  label: string;
}): React.JSX.Element {
  return (
    <nav className="sidebar-rail-group" aria-label={label}>
      {items.map(({ to, label: itemLabel, icon: Icon }) => (
        <RailTooltip key={to} label={itemLabel}>
          <NavLink
            to={to}
            end={to === "/plugins"}
            className="sidebar-rail-button"
            aria-label={itemLabel}
          >
            <Icon aria-hidden="true" />
          </NavLink>
        </RailTooltip>
      ))}
    </nav>
  );
}
