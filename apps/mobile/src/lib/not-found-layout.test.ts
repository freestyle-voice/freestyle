import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../app/+not-found.tsx", import.meta.url),
  "utf8",
);

describe("not-found layout", () => {
  it("flattens the Link-asChild style before Expo Router's Slot receives it", () => {
    expect(screen).toMatch(
      /<Link href="\/\(app\)\/\(tabs\)" replace asChild>[\s\S]*?style=\{StyleSheet\.flatten\(\[/,
    );
  });
});
