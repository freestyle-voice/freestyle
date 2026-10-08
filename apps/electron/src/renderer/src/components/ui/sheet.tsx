import { cn } from "@renderer/lib/utils";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>,
) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

/** A right-hand sheet. Docked content lives in a reserved layout column. */
function SheetContent({
  docked = false,
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { docked?: boolean }) {
  const content = (
    <SheetPrimitive.Content
      data-slot="sheet-content"
      className={cn(
        "bg-card text-card-foreground border-border flex min-h-0 flex-col overflow-hidden border-l text-sm outline-none duration-200 ease-out data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
        docked
          ? "absolute inset-0"
          : "fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] shadow-xl",
        className,
      )}
      {...props}
    />
  );
  if (docked) return content;
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/20 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none" />
      {content}
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("text-base font-medium", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("text-muted-foreground text-xs", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
};
