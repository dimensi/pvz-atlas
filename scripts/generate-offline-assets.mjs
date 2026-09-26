import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const buildRoot = join(process.cwd(), ".next");
const staticRoot = join(buildRoot, "static");
const shellRoutes = ["/points", "/map", "/add", "/owners", "/sync"];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    })
  );
  return nested.flat();
}

const buildId = (await readFile(join(buildRoot, "BUILD_ID"), "utf8")).trim();
const prerenderManifest = JSON.parse(
  await readFile(join(buildRoot, "prerender-manifest.json"), "utf8")
);
const assets = (await listFiles(staticRoot))
  .filter((path) => !path.endsWith(".map"))
  .map((path) => `/_next/static/${relative(staticRoot, path).split(sep).join("/")}`)
  .sort();

if (
  !/^[a-zA-Z0-9_-]+$/.test(buildId) ||
  assets.length === 0 ||
  shellRoutes.some((route) => prerenderManifest.routes?.[route]?.initialRevalidateSeconds !== false)
) {
  throw new Error("Cannot generate the offline asset manifest from this Next.js build.");
}

await writeFile(
  join(process.cwd(), "public", "offline-assets.json"),
  `${JSON.stringify({ buildId, assets })}\n`
);
