import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataSkeleton } from "./data-skeleton";

describe("DataSkeleton", () => {
  it("exposes an accessible busy label and reserves multiple rows", () => {
    const html = renderToStaticMarkup(
      createElement(DataSkeleton, { label: "Loading conversations" }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading conversations"');
    expect(html.match(/tavern-data-skeleton-row/g)).toHaveLength(3);
  });
});
