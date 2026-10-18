// Zips dist/ into release/mail-link-guard-<version>.zip for upload to the Chrome Web
// Store. Run through `pnpm package`, which builds first.

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

// The e2e build opens the dialog's shadow root for inspection; never ship it.
const content = await readFile(join(root, "dist/content.js"), "utf8");
if (!content.includes('mode: false ? "open" : "closed"')) {
  throw new Error("dist/ is not a release build. Run `pnpm package`, which rebuilds it.");
}
const manifest = JSON.parse(await readFile(join(root, "dist/manifest.json"), "utf8"));
const releaseDir = join(root, "release");
const zipPath = join(releaseDir, `mail-link-guard-${manifest.version}.zip`);

await mkdir(releaseDir, { recursive: true });
await rm(zipPath, { force: true });
execFileSync("zip", ["-r", "-X", "-q", zipPath, ".", "-x", "*.DS_Store"], {
  cwd: join(root, "dist"),
  stdio: "inherit",
});
console.log(`wrote ${zipPath}`);
