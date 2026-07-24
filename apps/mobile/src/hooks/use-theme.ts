/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from "@/constants/theme";
import { useColorMode } from "@/lib/color-mode";

export function useTheme() {
  const { scheme } = useColorMode();
  return Colors[scheme];
}
