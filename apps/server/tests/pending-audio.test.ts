import { describe, expect, it } from "vitest";
import { createPendingAudio } from "../src/lib/streaming/pending-audio.js";

describe("createPendingAudio", () => {
  it("evicts the oldest chunk when the buffer reaches its cap", () => {
    const pending = createPendingAudio();

    for (let index = 0; index < 1024; index += 1) {
      pending.hold(new Uint8Array([index & 0xff, index >> 8]).buffer);
    }
    pending.hold(new Uint8Array([0xaa, 0xbb]).buffer);

    const flushed: ArrayBuffer[] = [];
    pending.flush((chunk) => flushed.push(chunk));

    expect(flushed).toHaveLength(1024);
    expect(Array.from(new Uint8Array(flushed[0]))).toEqual([1, 0]);
    expect(Array.from(new Uint8Array(flushed.at(-1)!))).toEqual([0xaa, 0xbb]);
  });
});
