import type { LocalLlmConfigInput } from "@freestyle/validations";
import {
  LlmModelRow,
  MODEL_ROW_PAGE_SIZE,
  PROVIDER_FILTER_MARKS,
  ProviderModelHeader,
  ShowMoreModelRowsButton,
} from "@renderer/components/model-row";
import type { AvailableModel } from "@renderer/lib/models";
import { cn } from "@renderer/lib/utils";
import { Eye, EyeOff, Laptop, Loader2, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import type { useForm } from "react-hook-form";

import { ModelPickerShell } from "./model-picker-shell";
import type { ConfiguredModel, PickerFilter } from "./types";

// ---------------------------------------------------------------------------
// LlmPicker — inline picker for LLM cleanup: on-device (local server) + cloud
// ---------------------------------------------------------------------------

export function LlmPicker({
  modelsByProvider,
  currentDefault,
  search,
  setSearch,
  keyProviders,
  onSelectCloud,
  onClose,
  localForm,
  showLocalApiKey,
  setShowLocalApiKey,
  localTesting,
  localConnected,
  localError,
  localModels,
  onTestLocal,
  onClearLocalStatus,
  onSelectLocalModel,
}: {
  modelsByProvider: Map<
    string,
    { providerName: string; models: AvailableModel[] }
  >;
  currentDefault: ConfiguredModel | undefined;
  search: string;
  setSearch: (v: string) => void;
  keyProviders: Set<string>;
  onSelectCloud: (m: AvailableModel) => void;
  onClose: () => void;
  localForm: ReturnType<typeof useForm<LocalLlmConfigInput>>;
  showLocalApiKey: boolean;
  setShowLocalApiKey: (v: boolean) => void;
  localTesting: boolean;
  localConnected: boolean | null;
  localError: string | null;
  localModels: string[];
  onTestLocal: (e?: React.BaseSyntheticEvent) => Promise<void>;
  onClearLocalStatus: () => void;
  onSelectLocalModel: (modelName: string) => Promise<void>;
}): React.JSX.Element {
  const [filter, setFilter] = useState("all");
  const [visibleModelCounts, setVisibleModelCounts] = useState<
    Record<string, number>
  >({});
  const q = search.toLowerCase();
  const providerEntries = [...modelsByProvider.entries()];
  const providerFilters: PickerFilter[] = [
    { id: "all", label: "All" },
    { id: "local-llm", label: "On-device", icon: Laptop },
    ...providerEntries.map(([providerId, { providerName }]) => ({
      id: providerId,
      label: providerName,
      mark: PROVIDER_FILTER_MARKS[providerId],
    })),
  ];

  // On-device rows: discovered models ∪ the current default (so a previously
  // chosen local model still shows as selected before the user re-tests).
  const localNames = new Set(localModels);
  if (currentDefault?.provider === "local-llm") {
    localNames.add(currentDefault.model_id.replace(/^local-llm\//, ""));
  }
  const localList = [...localNames].filter(
    (n) => !q || n.toLowerCase().includes(q),
  );
  const showLocal = filter === "all" || filter === "local-llm";
  const visibleProviderEntries =
    filter === "all"
      ? providerEntries
      : filter === "local-llm"
        ? []
        : providerEntries.filter(([providerId]) => providerId === filter);
  const visibleProviderGroups = visibleProviderEntries
    .map(([providerId, { providerName, models }]) => {
      const filtered = q
        ? models.filter(
            (m) =>
              m.model_name.toLowerCase().includes(q) ||
              m.model_id.toLowerCase().includes(q) ||
              providerName.toLowerCase().includes(q),
          )
        : models;
      return { providerId, providerName, models: filtered };
    })
    .filter(({ models }) => models.length > 0);
  const visibleModels = visibleProviderGroups.flatMap(
    ({ providerId, providerName, models }) =>
      models.map((model) => ({ model, providerId, providerName })),
  );
  const isEmpty = !showLocal && visibleProviderGroups.length === 0;
  const visibleCountFor = (providerId: string) =>
    visibleModelCounts[providerId] ?? MODEL_ROW_PAGE_SIZE;
  const showMoreFor = (providerId: string, total: number) => {
    setVisibleModelCounts((prev) => ({
      ...prev,
      [providerId]: Math.min(
        (prev[providerId] ?? MODEL_ROW_PAGE_SIZE) + MODEL_ROW_PAGE_SIZE,
        total,
      ),
    }));
  };

  return (
    <ModelPickerShell
      icon={Sparkles}
      title="Pick an LLM model"
      filters={providerFilters}
      activeFilter={filter}
      onFilterChange={setFilter}
      headerAccessory={
        <div className="border-border bg-background order-last flex w-full flex-none items-center gap-2 rounded-md border px-2.5 py-1 sm:order-none sm:ml-3 sm:min-w-0 sm:flex-1">
          <Search className="text-muted-foreground h-3.5 w-3.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="placeholder:text-muted-foreground/70 min-w-0 flex-1 border-none bg-transparent text-[12.5px] outline-none"
          />
        </div>
      }
      empty={isEmpty}
      onClose={onClose}
    >
      {/* On-device group - connect a local server, then pick a model */}
      {showLocal && (
        <div>
          <div className="border-border bg-card sticky top-0 z-10 flex items-center gap-2 border-b px-5 py-2">
            <Laptop className="text-primary h-3 w-3" />
            <span
              className="mono text-foreground text-[10px] uppercase"
              style={{ letterSpacing: "0.14em" }}
            >
              On-device
            </span>
            <span className="text-muted-foreground text-[11.5px]">
              Ollama, LM Studio & other OpenAI-compatible servers
            </span>
          </div>

          <form
            onSubmit={onTestLocal}
            className="border-border space-y-2.5 border-b px-5 py-3.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                {...localForm.register("url", {
                  onChange: onClearLocalStatus,
                })}
                placeholder="http://localhost:11434"
                className={cn(
                  "border-border bg-background min-w-0 flex-1 rounded-md border px-3 py-2 text-[13px]",
                  localForm.formState.errors.url && "border-destructive",
                )}
              />
              <button
                type="submit"
                disabled={localTesting}
                className="bg-secondary hover:bg-secondary/80 shrink-0 rounded-md px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50"
              >
                {localTesting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Testing…
                  </span>
                ) : (
                  "Test"
                )}
              </button>
            </div>
            <div className="relative">
              <input
                type={showLocalApiKey ? "text" : "password"}
                {...localForm.register("api_key")}
                placeholder="API key (optional)"
                className="border-border bg-background w-full rounded-md border px-3 py-2 pr-10 text-[13px]"
              />
              <button
                type="button"
                onClick={() => setShowLocalApiKey(!showLocalApiKey)}
                className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showLocalApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {localConnected === true && (
              <p className="text-primary text-[12px]">
                Connected ({localModels.length}{" "}
                {localModels.length === 1 ? "model" : "models"})
              </p>
            )}
            {localConnected === false && (
              <p className="text-destructive text-[12px]">{localError}</p>
            )}
            {localForm.formState.errors.url && (
              <p className="text-destructive text-[12px]">
                {localForm.formState.errors.url.message}
              </p>
            )}
          </form>

          {localList.length === 0 ? (
            <div className="text-muted-foreground px-5 py-3 text-[12px]">
              No local models yet — test a connection to list them.
            </div>
          ) : (
            localList.map((name) => {
              const modelId = `local-llm/${name}`;
              const isActive =
                currentDefault?.provider === "local-llm" &&
                currentDefault?.model_id === modelId;
              return (
                <LlmModelRow
                  key={name}
                  name={name}
                  providerName="On-device"
                  modelId={modelId}
                  selected={isActive}
                  hasKey
                  first={false}
                  onSelect={() => onSelectLocalModel(name)}
                />
              );
            })
          )}
        </div>
      )}

      {filter === "all"
        ? visibleProviderGroups.map(({ providerId, providerName, models }) => {
            const visibleCount = visibleCountFor(providerId);
            const visibleModels = models.slice(0, visibleCount);
            return (
              <div key={providerId}>
                <ProviderModelHeader
                  providerId={providerId}
                  providerName={providerName}
                  hasKey={keyProviders.has(providerId)}
                />
                {visibleModels.map((model, index) => {
                  const isActive =
                    currentDefault?.model_id === model.model_id &&
                    currentDefault?.provider === model.provider_id;
                  return (
                    <LlmModelRow
                      key={model.model_id}
                      name={model.model_name}
                      providerName={providerName}
                      modelId={model.model_id}
                      selected={isActive}
                      hasKey={keyProviders.has(providerId)}
                      first={index === 0}
                      onSelect={() => onSelectCloud(model)}
                    />
                  );
                })}
                <ShowMoreModelRowsButton
                  hiddenCount={models.length - visibleModels.length}
                  onClick={() => showMoreFor(providerId, models.length)}
                />
              </div>
            );
          })
        : visibleModels.map(({ providerId, providerName, model }, index) => {
            if (index >= visibleCountFor(providerId)) return null;
            const isActive =
              currentDefault?.model_id === model.model_id &&
              currentDefault?.provider === model.provider_id;
            return (
              <LlmModelRow
                key={`${providerId}:${model.model_id}`}
                name={model.model_name}
                providerName={providerName}
                modelId={model.model_id}
                selected={isActive}
                hasKey={keyProviders.has(providerId)}
                first={index === 0}
                onSelect={() => onSelectCloud(model)}
              />
            );
          })}
      {filter !== "all" &&
        visibleProviderGroups.map(({ providerId, models }) => (
          <ShowMoreModelRowsButton
            key={`${providerId}:more`}
            hiddenCount={models.length - visibleCountFor(providerId)}
            onClick={() => showMoreFor(providerId, models.length)}
          />
        ))}
    </ModelPickerShell>
  );
}
