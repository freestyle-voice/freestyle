import { listBrainFiles, readBrainFile } from "@renderer/lib/brain-fs";

export type NoteSummary = {
  path: string;
  title: string;
  snippet: string;
  modified: number;
};

function noteLines(text: string): { title: string; snippet: string } {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  return {
    title: lines[0] ?? "New note",
    snippet: lines[1] ?? "",
  };
}

export async function listNoteSummaries(): Promise<NoteSummary[]> {
  const files = await listBrainFiles("notes");
  const summaries = await Promise.all(
    files.map(async (file) => {
      const path = file.path.replace(/\\/g, "/");
      const text = (await readBrainFile(path)) ?? "";
      return { path, ...noteLines(text), modified: file.modified };
    }),
  );
  return summaries.sort((a, b) => b.modified - a.modified);
}
