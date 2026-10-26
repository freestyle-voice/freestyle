import { Button } from "@renderer/components/ui/button";
import {
  InputGroup,
  InputGroupInput,
} from "@renderer/components/ui/input-group";
import { RevealToggle } from "@renderer/components/ui/reveal-toggle";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@renderer/components/ui/toggle-group";
import { type AvailableModel, PROVIDER_KEY_URLS } from "@renderer/lib/models";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Key,
  Loader2,
  Plus,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { CLEANUP_API_PROVIDERS } from "./cleanup-model-choice";
import type { UseModels } from "./use-models";
import { displayName } from "./utils";

const GATEWAYS = new Set(["openrouter", "vercel"]);

/** Connecting keys is independent of selecting the active model or role. */
export function ProviderConnections({
  m,
  models,
  selected,
  onSelectedChange,
  browseAll,
  onBrowseChange,
  connecting,
  onConnectingChange,
  saving,
  onSavingChange,
}: {
  m: UseModels;
  models: AvailableModel[];
  selected: string[];
  onSelectedChange: Dispatch<SetStateAction<string[]>>;
  browseAll: boolean;
  onBrowseChange: (browse: boolean) => void;
  connecting: string | null;
  onConnectingChange: (provider: string | null) => void;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
}): React.JSX.Element {
  const [success, setSuccess] = useState("");
  const connected = CLEANUP_API_PROVIDERS.filter((provider) =>
    m.keyProviders.has(provider),
  );
  const invalid = m.apiKeys.filter(
    (entry) =>
      entry.status === "invalid" &&
      CLEANUP_API_PROVIDERS.includes(entry.provider),
  );
  const providers = browseAll ? CLEANUP_API_PROVIDERS : connected;
  return (
    <section
      aria-label="Provider connections"
      className="border-border flex flex-col gap-3 border-b px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-foreground text-[13px] font-semibold">
            Connected providers{" "}
            <span className="text-muted-foreground ml-1 font-normal">
              {m.keysLoading ? "…" : connected.length}
            </span>
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Connect several providers. Choose a model when you’re ready.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={m.keysLoading || saving}
          onClick={() => {
            setSuccess("");
            onConnectingChange(
              CLEANUP_API_PROVIDERS.find(
                (provider) => !m.keyProviders.has(provider),
              ) ?? "openai",
            );
          }}
        >
          <Plus data-icon="inline-start" /> Add provider
        </Button>
      </div>
      {success && (
        <p
          role="status"
          className="text-primary flex items-center gap-1.5 text-xs"
        >
          <Check className="size-3.5" />
          {success}
        </p>
      )}
      {m.keysLoading && (
        <p role="status" className="text-muted-foreground text-xs">
          Loading provider connections…
        </p>
      )}
      {!m.keysLoading && connected.length === 0 && !browseAll && (
        <p className="text-muted-foreground text-xs">
          Add a provider key to see its models here, or browse providers first.
        </p>
      )}
      {providers.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant={selected.length === 0 ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={selected.length === 0}
              onClick={() => onSelectedChange([])}
            >
              {browseAll ? "All providers" : "All connected"}
            </Button>
            {selected.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onSelectedChange([])}
              >
                Clear filters
              </Button>
            )}
          </div>
          {[false, true].map((gateway) => {
            const group = providers.filter(
              (provider) => GATEWAYS.has(provider) === gateway,
            );
            if (!group.length) return null;
            return (
              <div
                key={String(gateway)}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="text-muted-foreground mr-1 text-[10px] font-medium uppercase tracking-wide">
                  {gateway ? "AI gateways" : "Direct providers"}
                </span>
                <ToggleGroup
                  type="multiple"
                  value={selected}
                  onValueChange={onSelectedChange}
                  variant="outline"
                  size="sm"
                  aria-label={
                    gateway ? "AI gateway filters" : "Direct provider filters"
                  }
                  className="flex-wrap"
                >
                  {group.map((provider) => {
                    const entry = m.apiKeys.find(
                      (key) => key.provider === provider,
                    );
                    const count = models.filter(
                      (model) => model.provider_id === provider,
                    ).length;
                    return (
                      <ToggleGroupItem
                        key={provider}
                        value={provider}
                        aria-label={`Filter ${displayName(provider)} models`}
                        className="rounded-full"
                        title={
                          entry?.status === "unknown"
                            ? "Saved key · not yet verified"
                            : entry?.status === "invalid"
                              ? "Key needs attention"
                              : m.keyProviders.has(provider)
                                ? "Connected"
                                : "API key required"
                        }
                      >
                        {displayName(provider)}{" "}
                        <span className="opacity-65">{count}</span>
                        {entry?.status === "unknown" && (
                          <span className="opacity-65">· saved key</span>
                        )}
                        {entry?.status === "invalid" && (
                          <span className="text-destructive">· needs key</span>
                        )}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              </div>
            );
          })}
        </div>
      )}
      {invalid.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-destructive">Needs attention</span>
          {invalid.map((entry) => (
            <Button
              key={entry.provider}
              size="xs"
              variant="ghost"
              disabled={saving}
              className="text-destructive"
              onClick={() => {
                setSuccess("");
                onConnectingChange(entry.provider);
              }}
            >
              Repair {displayName(entry.provider)} key
            </Button>
          ))}
        </div>
      )}
      <Button
        variant="link"
        size="xs"
        className="h-auto self-start p-0 text-xs"
        onClick={() => {
          onBrowseChange(!browseAll);
          onSelectedChange([]);
        }}
      >
        {browseAll ? "Show connected providers" : "Browse all providers"}
        <ChevronDown data-icon="inline-end" />
      </Button>
      {connecting !== null && (
        <ProviderKeyForm
          key={connecting}
          provider={connecting}
          onProviderChange={onConnectingChange}
          saveKey={m.saveKey}
          saving={saving}
          onSavingChange={onSavingChange}
          onCancel={() => onConnectingChange(null)}
          onSaved={(provider) => {
            onSelectedChange((current) =>
              current.length > 0 && !current.includes(provider)
                ? [...current, provider]
                : current,
            );
            setSuccess(
              `${displayName(provider)} connected. Your selected model hasn’t changed.`,
            );
            onConnectingChange(null);
          }}
        />
      )}
    </section>
  );
}

function ProviderKeyForm({
  provider,
  onProviderChange,
  saveKey,
  onCancel,
  onSaved,
  saving,
  onSavingChange,
}: {
  provider: string;
  onProviderChange: (provider: string) => void;
  saveKey: UseModels["saveKey"];
  onCancel: () => void;
  onSaved: (provider: string) => void;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
}): React.JSX.Element {
  const id = useId();
  const [key, setKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const trigger = document.activeElement;
    keyInput.current?.focus();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <form
      aria-label="Connect provider"
      className="border-border flex flex-col gap-3 border-t pt-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving || !key.trim()) return;
        onSavingChange(true);
        setError(null);
        try {
          const failure = await saveKey(provider, key.trim());
          if (failure) setError(failure);
          else {
            setKey("");
            setRevealed(false);
            onSaved(provider);
          }
        } catch {
          setError("Could not connect this provider. Please try again.");
        } finally {
          onSavingChange(false);
        }
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${id}-provider`}
            className="text-muted-foreground text-xs"
          >
            Provider
          </label>
          <Select
            value={provider}
            onValueChange={onProviderChange}
            disabled={saving}
          >
            <SelectTrigger id={`${id}-provider`} className="h-9 min-w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[false, true].map((gateway) => (
                <SelectGroup key={String(gateway)}>
                  <SelectLabel>
                    {gateway ? "AI gateways" : "Direct providers"}
                  </SelectLabel>
                  {CLEANUP_API_PROVIDERS.filter(
                    (item) => GATEWAYS.has(item) === gateway,
                  ).map((item) => (
                    <SelectItem key={item} value={item}>
                      {displayName(item)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button asChild variant="link" size="xs">
          <a
            href={PROVIDER_KEY_URLS[provider]}
            target="_blank"
            rel="noreferrer"
          >
            Get {displayName(provider)} API key <ExternalLink />
          </a>
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-key`} className="text-muted-foreground text-xs">
          API key
        </label>
        <InputGroup>
          <InputGroupInput
            ref={keyInput}
            id={`${id}-key`}
            type={revealed ? "text" : "password"}
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              setError(null);
            }}
            disabled={saving}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Paste your API key"
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <RevealToggle
            revealed={revealed}
            onToggle={() => setRevealed(!revealed)}
            label="API key"
          />
        </InputGroup>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="ink"
          disabled={saving || !key.trim()}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Key />}
          {saving ? "Validating key…" : "Connect provider"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setKey("");
            onCancel();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
