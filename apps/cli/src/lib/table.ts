import chalk from "chalk";

interface Column {
  key: string;
  label: string;
  width?: number;
  transform?: (value: unknown) => string;
}

export function formatTable(
  rows: Record<string, any>[],
  columns: Column[],
): string {
  if (rows.length === 0) {
    return chalk.dim("No results found.");
  }

  const widths = columns.map((col) => {
    const headerLen = col.label.length;
    const maxDataLen = rows.reduce((max, row) => {
      const val = col.transform
        ? col.transform(row[col.key])
        : String(row[col.key] ?? "");
      return Math.max(max, val.length);
    }, 0);
    return col.width ?? Math.max(headerLen, Math.min(maxDataLen, 60));
  });

  const header = columns
    .map((col, i) => chalk.bold(col.label.padEnd(widths[i]!)))
    .join("  ");

  const separator = widths.map((w) => chalk.dim("-".repeat(w))).join("  ");

  const body = rows.map((row) =>
    columns
      .map((col, i) => {
        const val = col.transform
          ? col.transform(row[col.key])
          : String(row[col.key] ?? "");
        return val.padEnd(widths[i]!);
      })
      .join("  "),
  );

  return [header, separator, ...body].join("\n");
}

export function formatKeyValue(pairs: [string, string][]): string {
  const maxKeyLen = pairs.reduce((max, [key]) => Math.max(max, key.length), 0);

  return pairs
    .map(([key, value]) => `${chalk.bold(key.padEnd(maxKeyLen))}  ${value}`)
    .join("\n");
}
