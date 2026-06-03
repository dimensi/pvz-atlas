import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function cssBlock(selector: string): string {
  const match = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(globalStyles);

  return match?.[1] ?? "";
}

describe("map marker status CSS", () => {
  it("does not draw the old status ring around pins", () => {
    expect(globalStyles).not.toContain("--marker-status-ring");
    expect(cssBlock(".map-marker-with-image .map-marker-pin img")).toContain("border: 0;");
    expect(cssBlock(".map-marker-with-image .map-marker-pin img")).toContain("box-shadow: none;");
    expect(cssBlock(".map-marker-vector-pin")).toContain("border: 0;");
    expect(cssBlock(".map-marker-vector-pin")).toContain("box-shadow: none;");
  });

  it("makes new markers half transparent", () => {
    expect(cssBlock(".map-marker-status-new")).toContain("--marker-pin-opacity: 0.5;");
    expect(globalStyles).toContain("opacity: var(--marker-pin-opacity);");
  });

  it("keeps active markers fully opaque", () => {
    expect(cssBlock(".map-marker-status-active")).toContain("--marker-pin-opacity: 1;");
  });

  it("adds a bright yellow halo for markers that need review", () => {
    const needsReviewStyles = cssBlock(".map-marker-status-needs-review");

    expect(needsReviewStyles).toContain("--marker-status-halo: rgba(250, 204, 21, 0.55);");
    expect(globalStyles).toContain(".map-marker-pin::before");
  });
});
