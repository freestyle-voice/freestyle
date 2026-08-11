import { describe, expect, test } from "vitest";
import {
  getSwayFocusedWindowBounds,
  parseWindowBounds,
} from "../../../shared/focused-window";

describe("parseWindowBounds", () => {
  test("accepts a positive external window rectangle", () => {
    expect(
      parseWindowBounds(
        '{"x":-1920,"y":0,"width":1920,"height":1080,"pid":42}',
      ),
    ).toEqual({ x: -1920, y: 0, width: 1920, height: 1080, pid: 42 });
  });

  test("rejects malformed or empty window rectangles", () => {
    expect(parseWindowBounds("not json")).toBeNull();
    expect(
      parseWindowBounds('{"x":0,"y":0,"width":0,"height":1080}'),
    ).toBeNull();
  });
});

describe("getSwayFocusedWindowBounds", () => {
  test("returns the focused external node's absolute rectangle", () => {
    expect(
      getSwayFocusedWindowBounds(
        {
          focused: false,
          nodes: [
            {
              focused: true,
              pid: 42,
              rect: { x: -1920, y: 0, width: 1920, height: 1080 },
            },
          ],
        },
        99,
      ),
    ).toEqual({ x: -1920, y: 0, width: 1920, height: 1080, pid: 42 });
  });

  test("rejects Freestyle's focused Sway node", () => {
    expect(
      getSwayFocusedWindowBounds(
        {
          focused: true,
          pid: 99,
          rect: { x: 0, y: 0, width: 1728, height: 1117 },
        },
        99,
      ),
    ).toBeNull();
  });

  test("rejects a focused Sway node whose owner cannot be identified", () => {
    expect(
      getSwayFocusedWindowBounds(
        {
          focused: true,
          rect: { x: 0, y: 0, width: 1728, height: 1117 },
        },
        99,
      ),
    ).toBeNull();
  });
});
