import { Button } from "@renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { cn } from "@renderer/lib/utils";
import { ChevronsUpDown, Cloud, Loader2, LogIn, LogOut } from "lucide-react";

const ROW =
  "flex w-full items-center gap-2.5 rounded-[7px] border border-transparent px-2.5 py-1.5 text-[13px] transition-colors";

export function CloudProfileButton(): React.JSX.Element {
  const { user, loading, signingIn, signIn, signOut } = useCloudAuth();

  if (loading) {
    return (
      <div className={cn(ROW, "text-muted-foreground/50")}>
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        <span className="flex-1 text-left">…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="border-border bg-card rounded-[10px] border p-3">
        <div className="flex items-center gap-1.5">
          <Cloud className="text-primary size-3.5 shrink-0" />
          <span className="text-foreground text-[12.5px] font-medium">
            Freestyle Cloud
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
          Fast, accurate transcription, no API key required.
        </p>
        <Button
          size="sm"
          onClick={() => void signIn()}
          disabled={signingIn}
          className="bg-accent text-accent-foreground hover:bg-accent/70 mt-2.5 w-full"
        >
          {signingIn ? (
            <>
              <Loader2 className="animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              <LogIn />
              Sign in
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            ROW,
            "text-foreground hover:bg-card/50 data-[state=open]:bg-card data-[state=open]:border-border",
          )}
        >
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className="size-7 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <span className="min-w-0 flex-1 text-left leading-tight">
            <span className="text-foreground block truncate font-medium">
              {user.name || user.email}
            </span>
            {user.name ? (
              <span className="text-muted-foreground block truncate text-[11px]">
                {user.email}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[200px]"
      >
        <div className="px-1.5 py-1">
          <div className="text-foreground truncate text-[13px] font-medium">
            {user.name || user.email}
          </div>
          <div className="text-muted-foreground truncate text-[11px]">
            {user.email}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
