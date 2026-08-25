import { Spacing } from "@/constants/theme";

export function composerBottomPadding({
  keyboardVisible,
  bottomInset,
}: {
  keyboardVisible: boolean;
  bottomInset: number;
}): number {
  return keyboardVisible ? Spacing.two : bottomInset + Spacing.three;
}
