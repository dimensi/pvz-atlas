import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const forbiddenFetchPattern = /fetch\(\s*["'`]\/api\/(?:sync|import|address)/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (path.includes(`${join("src", "app", "api")}`)) {
        return [];
      }

      return sourceFiles(path);
    }

    return /\.(tsx?|jsx?)$/.test(path) ? [path] : [];
  });
}

describe("frontend API access boundary", () => {
  it("does not call PVZ API routes directly from UI/source modules", () => {
    const offenders = sourceFiles(sourceRoot).filter((path) =>
      forbiddenFetchPattern.test(readFileSync(path, "utf8"))
    );

    expect(offenders).toEqual([]);
  });
});
