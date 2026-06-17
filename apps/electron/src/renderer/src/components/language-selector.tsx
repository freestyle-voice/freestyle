import { SUPPORTED_LANGUAGES } from "@renderer/i18n";
import { cn } from "@renderer/lib/utils";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface LanguageSelectorProps {
  className?: string;
}

export function LanguageSelector({
  className,
}: LanguageSelectorProps): React.JSX.Element {
  const { i18n, t } = useTranslation();

  const currentLang = SUPPORTED_LANGUAGES.includes(i18n.language)
    ? i18n.language
    : "en";

  const options = SUPPORTED_LANGUAGES.map((lang) => ({
    value: lang,
    label: t(`languageNames.${lang}`) || lang,
  }));

  return (
    <Select
      value={currentLang}
      onValueChange={(val) => i18n.changeLanguage(val)}
    >
      <SelectTrigger className={cn("w-full max-w-xs", className)}>
        <Globe className="text-muted-foreground size-4 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
