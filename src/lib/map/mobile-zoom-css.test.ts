import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const rootLayout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

function cssBlock(selector: string): string {
  const match = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(globalStyles);

  return match?.[1] ?? "";
}

describe("mobile map zoom safeguards", () => {
  it("keeps native filter selects at a mobile-safe font size", () => {
    expect(cssBlock(".filter-select select")).toContain("font-size: 16px;");
  });

  it("does not cap the viewport scale", () => {
    expect(rootLayout).not.toContain("maximumScale");
  });
});
