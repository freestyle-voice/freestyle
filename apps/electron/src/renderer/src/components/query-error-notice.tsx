import { Button } from "@renderer/components/ui/button";

export function QueryErrorNotice({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry: () => void;
}): React.JSX.Element | null {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="text-destructive mb-4 flex items-center gap-3 text-sm"
    >
      <span>{error.message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
