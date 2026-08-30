export interface PillSlotPosition {
  x: number;
  y: number;
}

export interface PillExpansionOffset {
  dx: number;
  dy: number;
}

/**
 * A pill is positioned by its collapsed slot. Expanded surfaces grow around
 * that slot, so later display corrections must apply the same offset instead
 * of moving the expanded window as though it were still collapsed.
 */
export function windowPositionForPillSlot(
  slot: PillSlotPosition,
  expansionOffset: PillExpansionOffset,
): PillSlotPosition {
  return {
    x: slot.x - expansionOffset.dx,
    y: slot.y - expansionOffset.dy,
  };
}
