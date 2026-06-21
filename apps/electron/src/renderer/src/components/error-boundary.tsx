import { reportError } from "@renderer/lib/report-error";
import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * App-level React error boundary. Catches render/lifecycle errors anywhere in
 * the tree, reports them to the diagnostic log + PostHog via {@link reportError},
 * and shows a calm fallback with a reload action instead of a white screen.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    reportError(error, {
      kind: "react-error-boundary",
      componentStack: info.componentStack ?? undefined,
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="bg-background text-foreground flex h-screen w-screen flex-col items-center justify-center gap-5 p-10 text-center">
        <span className="mono text-muted-foreground text-[11px] tracking-[0.16em] uppercase">
          Something went wrong
        </span>
        <h1 className="serif text-foreground m-0 max-w-[28rem] text-[24px] leading-tight font-normal">
          Freestyle hit an unexpected error.
        </h1>
        <p className="text-muted-foreground m-0 max-w-[26rem] text-[13px] leading-relaxed">
          The error was logged for diagnostics. Reloading usually fixes it — if
          it keeps happening, share your logs from Settings → Data.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border-border text-foreground hover:bg-secondary mt-1 rounded-md border px-4 py-2 text-[13px] font-medium transition-colors"
        >
          Reload
        </button>
      </div>
    );
  }
}
