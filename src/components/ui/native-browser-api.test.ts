import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenNativeApiPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
const sourceRoot = join(process.cwd(), "src");
const productionExtensions = new Set([".ts", ".tsx"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return sourceFiles(path);
    }

    if (
      !productionExtensions.has(path.slice(path.lastIndexOf("."))) ||
      path.includes(".test.") ||
      path.includes(".spec.")
    ) {
      return [];
    }

    return [path];
  });
}

describe("production UI browser-native dialogs", () => {
  it("does not use alert, confirm, or prompt in src", () => {
    const offenders = sourceFiles(sourceRoot)
      .map((file) => ({
        file,
        contents: readFileSync(file, "utf8")
      }))
      .filter(({ contents }) => forbiddenNativeApiPattern.test(contents))
      .map(({ file }) => relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
