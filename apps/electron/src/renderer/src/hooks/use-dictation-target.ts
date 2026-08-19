import {
  type DictationBase,
  type DictationMode,
  type DictationSinkEvent,
  nextUtterance,
  type RegisterDictationSink,
} from "@renderer/lib/dictation-sink";
import { useEffect, useRef } from "react";

export interface DictationTargetOptions {
  /** "replace" starts each utterance from empty; a to-do box holds one item. */
  mode?: DictationMode;
  /** Changing it abandons an in-flight utterance, e.g. on opening a new note. */
  resetKey?: string;
}

/** Routes dictated text into a field, tracking the utterance in progress. */
export function useDictationTarget(
  register: RegisterDictationSink,
  value: string,
  setValue: (text: string) => void,
  { mode = "append", resetKey = "" }: DictationTargetOptions = {},
): void {
  const baseRef = useRef<DictationBase>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const setValueRef = useRef(setValue);
  setValueRef.current = setValue;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const resetKeyRef = useRef(resetKey);
  if (resetKeyRef.current !== resetKey) {
    resetKeyRef.current = resetKey;
    baseRef.current = null;
  }

  useEffect(() => {
    const handler = (ev: DictationSinkEvent): void => {
      const next = nextUtterance(
        { base: baseRef.current, text: valueRef.current },
        ev,
        modeRef.current,
      );
      baseRef.current = next.base;
      valueRef.current = next.text;
      setValueRef.current(next.text);
    };
    const unregister = register(handler);
    return () => {
      baseRef.current = null;
      unregister();
    };
  }, [register]);
}
