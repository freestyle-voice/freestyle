import type { CompanionState } from "@shared/companion";
import type React from "react";

const LANTERN = "#D98E2B";
const CORE = 16;
const SATELLITE = 5;

const LEVEL_FLOOR = 0.05;
const LEVEL_GAIN = 8;
const LEVEL_AMPLITUDE = 0.55;

export function sparkScaleFor(level: number): number {
  const excess = Math.max(0, level - LEVEL_FLOOR);
  return 1 + LEVEL_AMPLITUDE * (1 - Math.exp(-LEVEL_GAIN * excess));
}

export function Spark({
  state,
  size = CORE,
  listening = false,
  levelRef,
}: {
  state: CompanionState;
  size?: number;
  listening?: boolean;
  levelRef?: React.RefObject<HTMLSpanElement | null>;
}): React.JSX.Element {
  const satellite = Math.max(3, Math.round((size / CORE) * SATELLITE));
  const offset = Math.round(size * 1.15);
  const working = state === "working";
  const suggesting = state === "suggestion";

  return (
    <div
      style={{
        position: "relative",
        width: size + offset,
        height: size + offset,
        display: "grid",
        placeItems: "center",
      }}
    >
      <span
        className="spark-satellite"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: satellite,
          height: satellite,
          background: LANTERN,
          opacity: working ? 0 : suggesting ? 0.9 : 0.55,
        }}
      />
      <span
        className="spark-satellite"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: satellite,
          height: satellite,
          background: LANTERN,
          opacity: working ? 0 : suggesting ? 0.9 : 0.4,
        }}
      />
      <span className="spark-level" ref={levelRef}>
        <span
          className={`spark-core${working ? " is-working" : ""}${
            listening ? " is-listening" : ""
          }`}
          style={{
            width: size,
            height: size,
            background: LANTERN,
            borderRadius: working ? Math.max(2, size * 0.18) : 1,
            boxShadow: suggesting
              ? `0 0 0 6px ${LANTERN}33, 0 0 14px 2px ${LANTERN}55`
              : undefined,
          }}
        />
      </span>
    </div>
  );
}
