// Turns a blocklist file exported from the options page into the JSON for "Policy for
// extensions" in the Google Admin console, so an organization can keep its list in Git
// and generate the policy from it. Exits with an error when any entry cannot be read.
//
//   pnpm policy blocklist.json > policy.json

import { readFile } from "node:fs/promises";
import { parseImport } from "../src/core/blocklist.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm policy <blocklist.json>");
  process.exit(2);
}
const { entries, invalid } = parseImport(await readFile(file, "utf8"));
if (invalid.length > 0) {
  console.error(
    `${file}: ${invalid.length} item(s) could not be read (item numbers: ${invalid.map((i) => i + 1).join(", ")})`,
  );
  process.exit(1);
}
const value = entries.map(({ type, value, note }) => ({ type, value, note }));
process.stdout.write(`${JSON.stringify({ enforcedBlocklist: { Value: value } }, null, 2)}\n`);
