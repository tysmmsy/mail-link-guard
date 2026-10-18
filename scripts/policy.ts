// Turns a blocklist file (JSONL or JSON) into the JSON for "Policy for extensions" in the
// Google Admin console, so an organization can keep its list as JSONL in Git and
// generate the policy from it. Exits with an error when any line cannot be read.
//
//   pnpm policy blocklist.jsonl > policy.json

import { readFile } from "node:fs/promises";
import { parseImport, toPolicyJson } from "../src/core/blocklist.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm policy <blocklist.jsonl>");
  process.exit(2);
}
const { entries, invalid } = parseImport(await readFile(file, "utf8"));
if (invalid.length > 0) {
  console.error(
    `${file}: ${invalid.length} item(s) could not be read (item numbers: ${invalid.map((i) => i + 1).join(", ")})`,
  );
  process.exit(1);
}
process.stdout.write(toPolicyJson(entries));
