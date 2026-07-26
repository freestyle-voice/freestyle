/**
 * Responsive layout hook for iPad / tablet support.
 *
 * Returns `isTablet` (true when the window is wider than the tablet breakpoint)
 * and ready-to-use font sizes that scale up modestly on wide screens so titles
 * and body text read proportionally on the larger canvas.
 *
 * Because it wraps `useWindowDimensions()`, it recomputes automatically on
 * rotation, Split View resize, and Slide Over — no manual listener needed.
 */

import { useWindowDimensions } from "react-native";

import { Layout } from "@/constants/theme";

export function useResponsive() {
  const { width } = useWindowDimensions();
  const isTablet = width >= Layout.tabletBreakpoint;

  return {
    isTablet,
    /** Tab screen title: 30 on phone, 36 on tablet. */
    tabTitleSize: isTablet ? 36 : 30,
    /** Pushed-page nav title: 26 on phone, 30 on tablet. */
    navTitleSize: isTablet ? 30 : 26,
    /** Brand wordmark on Home: 30 on phone, 36 on tablet. */
    brandSize: isTablet ? 36 : 30,
    /** Transcript body text: 20 on phone, 24 on tablet. */
    transcriptSize: isTablet ? 24 : 20,
    /** Transcript placeholder: 18 on phone, 22 on tablet. */
    transcriptPlaceholderSize: isTablet ? 22 : 18,
  } as const;
}
