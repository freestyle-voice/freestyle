import { getClient } from "@renderer/lib/api";
import { SETTINGS_QUERY_KEY } from "@renderer/lib/query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/**
 * How a single form field is persisted. Every Settings tab persists on change
 * (no submit button), so each field maps to exactly one of:
 *  - a server settings key (`PUT /settings/:key` + shared-cache patch), or
 *  - an IPC transport (`window.api.*`) for window-backed settings.
 */
export interface FieldPersister<T extends FieldValues> {
  /** Server settings key. Mutually exclusive with `ipc`. */
  key?: string;
  /** IPC transport for `window.api`-backed settings. */
  ipc?: (value: T[Path<T>]) => void | Promise<void>;
  /** Serialize the form value to the string the server/IPC expects. */
  serialize?: (value: T[Path<T>]) => string;
  /** Extra side-effect after a successful persist (e.g. notify main). */
  after?: (value: T[Path<T>]) => void;
  /** Extra fields to validate alongside this one (cross-field rules). */
  validateFields?: Path<T>[];
}

export interface UseSettingsFormResult<T extends FieldValues> {
  /** Validate + persist a single field, deduping unchanged values. */
  persistField: (field: Path<T>, persister: FieldPersister<T>) => Promise<void>;
  /** Record the baseline (call after `reset()` so dedup starts correct). */
  markSeeded: (values: T) => void;
  /** Field currently showing a transient "Saved" confirmation, if any. */
  savedField: Path<T> | null;
}

/**
 * Shared persist-on-change engine for the Settings tabs. Generalizes the
 * original inline NetworkPanel pattern: dedup unchanged values, validate the
 * field against the form's zod resolver, persist to the server or IPC, then
 * patch the shared settings cache so `["settings-all"]` stays truthful without
 * a refetch.
 */
export function useSettingsForm<T extends FieldValues>(
  form: UseFormReturn<T>,
): UseSettingsFormResult<T> {
  const { getValues, trigger } = form;
  const queryClient = useQueryClient();

  // Last value actually persisted per field, so a no-op change (or a re-seed)
  // never fires a redundant request or "Saved" flash.
  const committed = useRef<Partial<Record<Path<T>, unknown>>>({});
  const [savedField, setSavedField] = useState<Path<T> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const flashSaved = useCallback((field: Path<T>) => {
    setSavedField(field);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedField(null), 1500);
  }, []);

  const markSeeded = useCallback((values: T) => {
    committed.current = { ...values };
  }, []);

  const persistField = useCallback(
    async (field: Path<T>, persister: FieldPersister<T>) => {
      const value = getValues(field);
      if (committed.current[field] === value) return;

      const fieldsToValidate = persister.validateFields
        ? [field, ...persister.validateFields]
        : field;
      const valid = await trigger(fieldsToValidate);
      if (!valid) return;

      const serialized = persister.serialize
        ? persister.serialize(value)
        : String(value);

      try {
        if (persister.key) {
          const res = await getClient().api.settings[":key"].$put({
            param: { key: persister.key },
            json: { value: serialized },
          });
          if (!res.ok) return;
          // Keep the shared settings cache truthful without a refetch.
          const key = persister.key;
          queryClient.setQueryData<Record<string, string>>(
            SETTINGS_QUERY_KEY,
            (prev) => ({ ...(prev ?? {}), [key]: serialized }),
          );
        } else if (persister.ipc) {
          await persister.ipc(value);
        }
        committed.current[field] = value;
        persister.after?.(value);
        flashSaved(field);
      } catch {
        // Swallow — transient loopback/IPC errors; the field keeps its value
        // and the user can retry by editing again.
      }
    },
    [getValues, trigger, queryClient, flashSaved],
  );

  return { persistField, markSeeded, savedField };
}
