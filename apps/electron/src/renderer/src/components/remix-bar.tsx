import type React from "react";
import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

// Dwell so the dock/bottom edge isn't a tripwire for accidental opens.
const HOVER_DWELL_MS = 300;

function RemixBar(): React.JSX.Element {
  const [hot, setHot] = useState(false);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => {
    if (dwellRef.current) {
      clearTimeout(dwellRef.current);
      dwellRef.current = null;
    }
    window.api?.remixBarHover();
  }, []);

  const handleEnter = useCallback(() => {
    setHot(true);
    if (dwellRef.current) clearTimeout(dwellRef.current);
    dwellRef.current = setTimeout(open, HOVER_DWELL_MS);
  }, [open]);

  const handleLeave = useCallback(() => {
    setHot(false);
    if (dwellRef.current) {
      clearTimeout(dwellRef.current);
      dwellRef.current = null;
    }
  }, []);

  return (
    <button
      type="button"
      className="bar-hit"
      data-hot={hot}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={open}
      aria-label="Open Freestyle Remix"
      tabIndex={-1}
    >
      <style>{`
        html, body, #root { margin: 0; height: 100%; background: transparent; overflow: hidden; }
        .bar-hit {
          width: 100%;
          height: 100%;
          margin: 0;
          border: none;
          background: transparent;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0 0 3px;
          cursor: pointer;
          -webkit-user-select: none;
          user-select: none;
          outline: none;
        }
        .bar-strip {
          width: 72px;
          height: 6px;
          border-radius: 999px;
          background: rgba(22, 20, 15, 0.98);
          border: 1px solid rgba(245, 241, 228, 0.35);
          transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1),
            height 220ms cubic-bezier(0.22, 1, 0.36, 1),
            border-color 220ms ease;
        }
        .bar-hit[data-hot="true"] .bar-strip {
          width: 96px;
          height: 8px;
          border-color: rgba(245, 241, 228, 0.65);
        }
      `}</style>
      <div className="bar-strip" />
    </button>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<RemixBar />);
