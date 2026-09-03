import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "cloud-profile.tsx",
);

describe("CloudProfileButton", () => {
  it("keeps the account control compact and the profile row focused", async () => {
    const source = await readFile(componentPath, "utf8");
    const profileItem = source.slice(
      source.indexOf('onSelect={() => navigate("/profile")}'),
      source.indexOf(
        "<DropdownMenuSeparator />",
        source.indexOf('onSelect={() => navigate("/profile")}'),
      ),
    );

    expect(source).not.toContain("<Badge");
    expect(source).toContain("size-6 shrink-0 rounded-full");
    expect(profileItem).toContain("<ProfileAvatar");
    expect(profileItem).not.toContain("text-[11px]");
    expect(profileItem).not.toContain("<Settings");
  });
});
