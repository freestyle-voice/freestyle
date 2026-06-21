import { describe, expect, it } from "vitest";
import {
  assertEnoughDiskSpace,
  describeDownloadError,
  InsufficientDiskSpaceError,
} from "../src/lib/disk.js";

describe("describeDownloadError", () => {
  it("maps our own out-of-space error to a friendly sentence", () => {
    const err = new InsufficientDiskSpaceError(3 * 1024 ** 3, 1 * 1024 ** 3);
    const msg = describeDownloadError(err);
    expect(msg).toMatch(/not enough disk space/i);
    expect(msg).toMatch(/3\.0 GB/);
    expect(msg).not.toContain("\n");
  });

  it("collapses a raw tar 'No space left on device' dump to one line", () => {
    const raw =
      "Command failed: tar xzf /tmp/x.tar.gz -C /tmp\n" +
      "foo/_internal/scipy/_rotation.so: Write failed: No space left on device\n" +
      "foo/_internal/scipy/_rigid.so: Can't create: No space left on device";
    const msg = describeDownloadError(new Error(raw));
    expect(msg).toBe(
      "Not enough disk space to finish the download. Free up some space and try again.",
    );
    expect(msg).not.toContain("\n");
  });

  it("detects ENOSPC error codes", () => {
    const err = Object.assign(new Error("ENOSPC: no space left on device"), {
      code: "ENOSPC",
    });
    expect(describeDownloadError(err)).toMatch(/not enough disk space/i);
  });

  it("returns a trimmed first line for unrelated multi-line errors", () => {
    const msg = describeDownloadError(
      new Error("Model download failed: HTTP 404\nstack frame\nstack frame"),
    );
    expect(msg).toBe("Model download failed: HTTP 404");
  });
});

describe("assertEnoughDiskSpace", () => {
  it("passes when the requirement is tiny", async () => {
    await expect(
      assertEnoughDiskSpace(process.cwd(), 1),
    ).resolves.toBeUndefined();
  });

  it("throws InsufficientDiskSpaceError when the requirement is absurd", async () => {
    await expect(
      assertEnoughDiskSpace(process.cwd(), Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(InsufficientDiskSpaceError);
  });
});
