import { Button } from "@renderer/components/ui/button";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";

export function AsyncActionButton({
  action,
  label,
  variant,
}: {
  action: () => Promise<void>;
  label: string;
  variant: "destructive" | "outline";
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        variant={variant}
        size="sm"
        disabled={pending}
        onClick={() => {
          setFailed(false);
          setPending(true);
          void action()
            .catch(() => setFailed(true))
            .finally(() => setPending(false));
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {label}
      </Button>
      {failed ? (
        <span className="text-destructive text-xs" role="status">
          Couldn&apos;t complete that action. Try again.
        </span>
      ) : null}
    </div>
  );
}
