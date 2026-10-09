/** UTC text matching SQLite's created_at format, ordered over its calendar range. */
function utcTimestamp(date: Date): string {
  // Valid four-digit calendar input can cross SQLite's year limits in UTC.
  // These sentinels sort outside every supported created_at timestamp.
  if (date.getUTCFullYear() < 0) return "";
  if (date.getUTCFullYear() > 9999) return "\uffff";
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** Convert a validated local calendar date to an inclusive/exclusive UTC range. */
export function localDayBounds(day: string | Date): {
  start: string;
  end: string;
} {
  const [year, month, date] =
    typeof day === "string"
      ? day.split("-").map(Number)
      : [day.getFullYear(), day.getMonth() + 1, day.getDate()];
  const midnight = (offset: number) => {
    const value = new Date(0);
    value.setHours(0, 0, 0, 0);
    // setFullYear preserves years 0000–0099. Construct each midnight separately:
    // adding 24 hours, or advancing a normalized 01:00 midnight, shifts DST bounds.
    value.setFullYear(year, month - 1, date + offset);
    return utcTimestamp(value);
  };
  return { start: midnight(0), end: midnight(1) };
}
