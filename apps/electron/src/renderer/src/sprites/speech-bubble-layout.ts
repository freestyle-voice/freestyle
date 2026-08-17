export interface SpeechAnchor {
  x: number;
  y: number;
}

const BUBBLE_TAIL_HEIGHT = 14;
const BUBBLE_TAIL_TIP_X = 9;
const BUBBLE_TAIL_OFFSET_X = 24;

/**
 * Positions a speech bubble from the point its tail must reach, rather than
 * from a separate, hand-tuned bubble coordinate.
 */
export function speechBubbleLayout({
  windowSize,
  anchor,
}: {
  windowSize: number;
  anchor: SpeechAnchor;
}): {
  bubble: { left: number; bottom: number };
  tail: {
    left: number;
    bottom: number;
  };
} {
  const bubbleLeft = anchor.x - BUBBLE_TAIL_OFFSET_X;
  return {
    bubble: {
      left: bubbleLeft,
      bottom: windowSize - anchor.y + BUBBLE_TAIL_HEIGHT,
    },
    tail: {
      left: BUBBLE_TAIL_OFFSET_X - BUBBLE_TAIL_TIP_X,
      bottom: -BUBBLE_TAIL_HEIGHT,
    },
  };
}
