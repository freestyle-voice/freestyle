import { CronExpressionParser } from "cron-parser";

type Preview =
  | { kind: "interpreted" }
  | { kind: "cron"; next: string }
  | { kind: "error"; message: string };

/** Display-only estimate. Cloud remains authoritative about due work and execution. */
export function schedulePreview(
  cron: string | null,
  timezone: string,
  now = new Date(),
): Preview {
  try {
    if (!timezone.trim()) throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now);
  } catch {
    return {
      kind: "error",
      message:
        "Enter a valid timezone, such as Asia/Kolkata or America/New_York.",
    };
  }
  if (!cron?.trim()) return { kind: "interpreted" };
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) throw new Error();
    // Match Cloud's five-field dialect; parser extensions like L, # and H
    // must not produce a successful preview for a schedule Cloud rejects.
    const plain = parts.map((part, index) =>
      index === 3
        ? part.replace(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/gi, "1")
        : index === 4
          ? part.replace(/sun|mon|tue|wed|thu|fri|sat/gi, "1")
          : part,
    );
    if (plain.some((part) => !/^[\d*?,/-]+$/.test(part))) throw new Error();
    // Cloud normalizes Sunday endpoints before expanding ranges and steps.
    parts[4] = parts[4]
      .split(",")
      .map((part) => {
        const [range, ...step] = part.split("/");
        return [
          range
            .split("-")
            .map((endpoint) => (Number(endpoint) === 7 ? "0" : endpoint))
            .join("-"),
          ...step,
        ].join("/");
      })
      .join(",");
    const interval = CronExpressionParser.parse(parts.join(" "), {
      currentDate: now,
      tz: timezone,
    });
    const { minute, hour } = interval.fields;
    const times = hour.values.flatMap((h) =>
      minute.values.map((m) => Number(h) * 60 + Number(m)),
    );
    if (
      times.some((time, index) => index > 0 && time - times[index - 1] < 5) ||
      times[0] + 1440 - times[times.length - 1] < 5
    ) {
      return {
        kind: "error",
        message:
          "Choose times at least five minutes apart. Freestyle checks for due work every five minutes.",
      };
    }
    // Cloud skips absent spring-forward wall times instead of shifting them.
    const format = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const wallTime = (instant: number) => {
      const parts = format.formatToParts(instant);
      const number = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value);
      return Date.UTC(
        number("year"),
        number("month") - 1,
        number("day"),
        number("hour"),
        number("minute"),
      );
    };
    // At the minimum five-minute cadence, even a full repeated day contains
    // at most 288 candidates. Do not stop halfway through a repeated hour.
    const maxCandidates = (24 * 60) / 5 + 1;
    for (let attempt = 0; attempt < maxCandidates; attempt++) {
      const next = interval.next().toDate();
      const local = format.formatToParts(next);
      const h = Number(local.find((part) => part.type === "hour")?.value);
      const m = Number(local.find((part) => part.type === "minute")?.value);
      // During the autumn overlap Cloud chooses the first mapping only. Check
      // nearby offsets, including half-hour transitions, before accepting it.
      const wall = wallTime(next.getTime());
      let first = Infinity;
      for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
        const probe = wall + hours * 3_600_000;
        const candidate = wall - (wallTime(probe) - probe);
        if (wallTime(candidate) === wall) first = Math.min(first, candidate);
      }
      if (
        hour.values.some((value) => value === h) &&
        minute.values.some((value) => value === m) &&
        next.getTime() === first
      )
        return { kind: "cron", next: next.toISOString() };
    }
    throw new Error();
  } catch {
    return {
      kind: "error",
      message:
        "Enter a valid five-field cron expression, for example 0 8 * * 1-5.",
    };
  }
}
