export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Inclusive local calendar days, including today; safe across DST changes. */
export function getRecentDateRange(
  days: 1 | 3 | 7 | 30,
  now = new Date(),
): { from: Date; to: Date } {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from, to };
}
