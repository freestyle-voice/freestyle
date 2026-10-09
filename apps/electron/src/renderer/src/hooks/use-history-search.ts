import { type SetStateAction, useCallback, useEffect, useState } from "react";

const SEARCH_DELAY_MS = 250;

/** Keep typing immediate, then commit the search and its first page together. */
export function useHistorySearch() {
  const [search, setInput] = useState("");
  const [{ page, querySearch }, setQuery] = useState({
    page: 0,
    querySearch: "",
  });

  useEffect(() => {
    const nextSearch = search.trim();
    if (nextSearch === querySearch) return;
    const timer = setTimeout(() => {
      setQuery({ page: 0, querySearch: nextSearch });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, querySearch]);

  const setSearch = useCallback((value: string) => {
    setInput(value);
    // Clearing should restore the feed immediately, including onClear.
    if (!value.trim()) setQuery({ page: 0, querySearch: "" });
  }, []);
  const setPage = useCallback((value: SetStateAction<number>) => {
    setQuery((previous) => ({
      ...previous,
      page: typeof value === "function" ? value(previous.page) : value,
    }));
  }, []);

  return { page, setPage, search, setSearch, querySearch };
}
