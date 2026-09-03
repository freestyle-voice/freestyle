import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix session deletion", () => {
  it("uses an optimistic mutation that restores and refetches after a failed deletion", async () => {
    const source = await readFile(
      resolve(rendererRoot, "components/remix-session-context.tsx"),
      "utf8",
    );

    expect(source).toContain("useMutation");
    expect(source).toContain("onMutate");
    expect(source).toContain(
      "await queryClient.cancelQueries({ queryKey: queryKeys.threads.all })",
    );
    expect(source).toContain("optimisticallyDeleteThread");
    expect(source).toContain("restoreOptimisticallyDeletedThread");
    expect(source).toContain("const deletionVersionRef = useRef(0)");
    expect(source).toContain(
      "context.mutationVersion === deletionVersionRef.current",
    );
    expect(source).toContain("switchThread(newThread())");
    expect(source).toContain("onError");
    expect(source).toContain("Couldn’t delete this session.");
    expect(source).toContain("onSettled");
    expect(source).toContain("invalidateThreads(queryClient)");
  });
});
