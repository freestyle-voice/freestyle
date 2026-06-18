import {
  InputGroupAddon,
  InputGroupButton,
} from "@renderer/components/ui/input-group";
import { Eye, EyeOff } from "lucide-react";

/**
 * Trailing show/hide ("eye") toggle for a secret `InputGroupInput`. Render it
 * as the last child of an `InputGroup`, alongside an input whose `type` is
 * driven by `revealed` (`revealed ? "text" : "password"`).
 */
function RevealToggle({
  revealed,
  onToggle,
  label = "value",
}: {
  revealed: boolean;
  onToggle: () => void;
  /** Noun used in the aria-label, e.g. "API key" → "Show API key". */
  label?: string;
}) {
  return (
    <InputGroupAddon align="inline-end">
      <InputGroupButton
        size="icon-xs"
        aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
        onClick={onToggle}
      >
        {revealed ? <EyeOff /> : <Eye />}
      </InputGroupButton>
    </InputGroupAddon>
  );
}

export { RevealToggle };
