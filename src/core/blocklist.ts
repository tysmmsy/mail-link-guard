// The local blocklist: entry normalization, matching, and the JSON import/export
// format. Everything here is pure so the same rules apply in the content script,
// the options page and the tests.

import type { MessageKey } from "../locales.ts";
import { hostFromInput, isSameOrSubdomain } from "./hosts.ts";
import { parseHttpUrl } from "./link.ts";
import { toUnicodeHost } from "./punycode.ts";

export type EntryType = "domain" | "url" | "wildcard" | "regex";
export const ENTRY_TYPES: readonly EntryType[] = ["domain", "url", "wildcard", "regex"];

export interface BlockEntry {
  type: EntryType;
  /**
   * domain: a host name; matches it and its subdomains.
   * url: a URL prefix without fragment.
   * wildcard: "*" matches any run of characters. Without "/" it is matched against the
   *   host, with "://" against the whole URL, otherwise against host + path.
   * regex: a JavaScript regular expression (case-insensitive) tested against the URL.
   * Wildcards and regexes are tested against both the ASCII (xn--) and the Unicode form
   * of the host, so a pattern can be written with the characters a lookalike domain uses.
   */
  value: string;
  note: string;
  /** ISO 8601 timestamp. */
  addedAt: string;
}

export const EXPORT_FORMAT = "mail-link-guard/blocklist";
export const EXPORT_VERSION = 1;
export const MAX_ENTRIES = 10_000;
export const MAX_NOTE_LENGTH = 200;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_PATTERN_LENGTH = 500;
/** Longer URLs are cut before regex testing, to bound the time a pattern can take per click. */
const MAX_TESTED_URL_LENGTH = 4096;

export interface BlocklistExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  entries: BlockEntry[];
}

function withoutFragment(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  return copy.href;
}

/** Strips the /.../ delimiters people often copy along with a regex. */
function stripRegexDelimiters(s: string): string {
  const m = /^\/(.+)\/[a-z]*$/s.exec(s);
  return m ? m[1] : s;
}

function compileRegex(source: string): RegExp | null {
  try {
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}

function wildcardToRegex(pattern: string): RegExp {
  const body = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`, "i");
}

/** Canonical value for an entry, or null when the input is not valid for the type. */
export function normalizeValue(type: EntryType, input: string): string | null {
  const s = input.trim();
  switch (type) {
    case "domain":
      return hostFromInput(s);
    case "url": {
      const url = parseHttpUrl(s);
      return url ? withoutFragment(url) : null;
    }
    case "wildcard": {
      const v = s.normalize("NFKC").toLowerCase();
      if (!v.includes("*") || v.replace(/\*/g, "") === "" || v.length > MAX_PATTERN_LENGTH) {
        return null;
      }
      return v;
    }
    case "regex": {
      const v = stripRegexDelimiters(s);
      if (!v || v.length > MAX_PATTERN_LENGTH || !compileRegex(v)) return null;
      return v;
    }
  }
}

/**
 * Guesses the entry type of a bare string from an import file: "/.../" is a regex,
 * anything with "*" a wildcard, a URL with a path a URL, everything else a domain.
 */
export function guessType(input: string): EntryType {
  const s = input.trim();
  if (/^\/.+\/[a-z]*$/s.test(s)) return "regex";
  if (s.includes("*")) return "wildcard";
  return /^https?:\/\/[^/]+\/./i.test(s) ? "url" : "domain";
}

// Latin-looking letters from the Greek and Cyrillic blocks (а е о р с у х ѕ і ј һ ӏ ԁ ԛ ԝ
// and α ι κ ν ο ρ υ χ ϲ ϳ). A domain label made only of these reads as plain Latin text.
const LATIN_LOOKALIKES = "аеорсухѕіјһӏԁԛԝαικνορυχϲϳ";

/**
 * Entries every new install starts with. They follow "block when in doubt": each one
 * targets domains written to be mistaken for Latin text. The user can remove any of them.
 */
export const DEFAULT_PATTERNS: readonly { value: string; noteKey: MessageKey }[] = [
  {
    // A host that contains a Greek letter and spells "amazon" with Greek lookalikes
    // (α, μ, ζ, ο, η/ν/π) in any position, for example "αmazon.co.jp" or "amazοn.com".
    value: "^https?://(?=[^/]*[\\u0370-\\u03ff])[^/]*[aα][mμ][aα][zζ][oο][nηνπ]",
    noteKey: "defaultAmazonNote",
  },
  {
    // One label that mixes Latin letters with Greek or Cyrillic, for example
    // "pаypal.com" (Cyrillic а) or "gοogle.com" (Greek ο). Real domains rarely do this.
    value:
      "^https?://(?:[^/.:]*\\.)*(?:[^/.:]*[a-z][^/.:]*[\\u0370-\\u03ff\\u0400-\\u052f]|[^/.:]*[\\u0370-\\u03ff\\u0400-\\u052f][^/.:]*[a-z])",
    noteKey: "defaultMixedScriptNote",
  },
  {
    // One label written only with Latin-looking Greek or Cyrillic letters (plus digits
    // and hyphens), for example "аррӏе.com", which reads as "apple" but has no Latin.
    // Ordinary Greek or Russian words almost always contain a letter outside this set.
    value: `^https?://(?:[^/.:]*\\.)*(?=[^/.:]*[${LATIN_LOOKALIKES}])[${LATIN_LOOKALIKES}0-9-]{2,}(?=[/.:]|$)`,
    noteKey: "defaultLookalikeNote",
  },
];

export function defaultEntries(
  addedAt = new Date().toISOString(),
  note: (key: MessageKey) => string,
): BlockEntry[] {
  return DEFAULT_PATTERNS.map(({ value, noteKey }) => ({
    type: "regex",
    value,
    note: note(noteKey),
    addedAt,
  }));
}

export function makeEntry(
  type: EntryType,
  input: string,
  note = "",
  addedAt = new Date().toISOString(),
): BlockEntry | null {
  const value = normalizeValue(type, input);
  if (!value) return null;
  return { type, value, note: note.trim().slice(0, MAX_NOTE_LENGTH), addedAt };
}

export function entryKey(e: Pick<BlockEntry, "type" | "value">): string {
  return `${e.type}:${e.value}`;
}

/** The strings a URL is matched against, in its ASCII and Unicode-host forms. */
interface UrlForms {
  host: string[];
  hostPath: string[];
  href: string[];
}

function formsOf(url: URL): UrlForms {
  const href = withoutFragment(url).slice(0, MAX_TESTED_URL_LENGTH);
  const host = url.hostname;
  const uHost = toUnicodeHost(host);
  const rest = href.slice(url.protocol.length + 2 + url.host.length);
  const uHref =
    uHost === host
      ? href
      : href.replace(`//${url.host}`, `//${uHost}${url.port ? `:${url.port}` : ""}`);
  const pick = (a: string, b: string) => (a === b ? [a] : [a, b]);
  return {
    host: pick(host, uHost),
    hostPath: pick(host + rest, uHost + rest),
    href: pick(href, uHref),
  };
}

type Matcher = (url: URL, forms: UrlForms) => boolean;

function matcherFor(e: BlockEntry): Matcher | null {
  switch (e.type) {
    case "domain":
      return (url) => isSameOrSubdomain(url.hostname, e.value);
    case "url":
      return (_url, f) => f.href[0].startsWith(e.value);
    case "wildcard": {
      const re = wildcardToRegex(e.value);
      const target: keyof UrlForms = e.value.includes("://")
        ? "href"
        : e.value.includes("/")
          ? "hostPath"
          : "host";
      return (_url, f) => f[target].some((s) => re.test(s));
    }
    case "regex": {
      const re = compileRegex(e.value);
      return re ? (_url, f) => f.href.some((s) => re.test(s)) : null;
    }
    default:
      return null;
  }
}

export type CompiledBlocklist = (url: URL) => BlockEntry | null;

/**
 * Compiles the entries once (wildcards and regexes become RegExp objects) so a click
 * only runs the tests. Entries that no longer compile are skipped.
 */
export function compileBlocklist(entries: readonly BlockEntry[]): CompiledBlocklist {
  const compiled = entries.flatMap((e) => {
    const m = matcherFor(e);
    return m ? [{ e, m }] : [];
  });
  return (url) => {
    if (compiled.length === 0) return null;
    const forms = formsOf(url);
    for (const { e, m } of compiled) if (m(url, forms)) return e;
    return null;
  };
}

/** Returns the first entry that blocks `url`, or null. */
export function findBlock(entries: readonly BlockEntry[], url: URL): BlockEntry | null {
  return compileBlocklist(entries)(url);
}

export interface MergeResult {
  entries: BlockEntry[];
  added: number;
  duplicates: number;
}

/** Appends `incoming` to `existing`, keeping the existing entry when both share a key. */
export function mergeEntries(
  existing: readonly BlockEntry[],
  incoming: readonly BlockEntry[],
): MergeResult {
  const seen = new Set(existing.map(entryKey));
  const entries = [...existing];
  let added = 0;
  let duplicates = 0;
  for (const e of incoming) {
    const key = entryKey(e);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    entries.push(e);
    added++;
  }
  return { entries, added, duplicates };
}

export function removeEntry(entries: readonly BlockEntry[], key: string): BlockEntry[] {
  return entries.filter((e) => entryKey(e) !== key);
}

/**
 * The export file. Entries are written one per line inside the array, so a list kept
 * in Git still diffs line by line while the file stays plain JSON.
 */
export function toExportJson(entries: readonly BlockEntry[], now = new Date()): string {
  const lines = entries.map(
    ({ type, value, note, addedAt }) => `    ${JSON.stringify({ type, value, note, addedAt })}`,
  );
  const head = `  "format": ${JSON.stringify(EXPORT_FORMAT)},\n  "version": ${EXPORT_VERSION},\n  "exportedAt": ${JSON.stringify(now.toISOString())},\n`;
  const body = lines.length ? `[\n${lines.join(",\n")}\n  ]` : "[]";
  return `{\n${head}  "entries": ${body}\n}\n`;
}

export interface ParseResult {
  entries: BlockEntry[];
  /** Zero-based positions of items that could not be read, for the import report. */
  invalid: number[];
}

export class ImportError extends Error {}

function entryFromItem(item: unknown, now: string): BlockEntry | null {
  if (typeof item === "string") return makeEntry(guessType(item), item, "", now);
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const raw = typeof o.value === "string" ? o.value : null;
  if (!raw) return null;
  const type: EntryType = ENTRY_TYPES.includes(o.type as EntryType)
    ? (o.type as EntryType)
    : guessType(raw);
  const note = typeof o.note === "string" ? o.note : "";
  const addedAt =
    typeof o.addedAt === "string" && !Number.isNaN(Date.parse(o.addedAt)) ? o.addedAt : now;
  return makeEntry(type, raw, note, addedAt);
}

/** Reads the entries out of an export file or a bare array. */
function itemsFromJson(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const d = data as Partial<BlocklistExport>;
    if (Array.isArray(d.entries)) {
      if (d.format !== undefined && d.format !== EXPORT_FORMAT)
        throw new ImportError("wrong-format");
      if (typeof d.version === "number" && d.version > EXPORT_VERSION) {
        throw new ImportError("newer-version");
      }
      return d.entries;
    }
  }
  throw new ImportError("wrong-format");
}

/**
 * Reads an import file: the export format, a bare array of entry objects, or a bare
 * array of strings (each a domain, URL, wildcard, or /regex/). Throws ImportError when
 * the file as a whole is unusable; individual bad items are reported in `invalid`.
 */
export function parseImport(text: string, now = new Date().toISOString()): ParseResult {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) {
    throw new ImportError("too-large");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("not-json");
  }
  const items = itemsFromJson(data);
  if (items.length > MAX_ENTRIES) throw new ImportError("too-many");

  const entries: BlockEntry[] = [];
  const invalid: number[] = [];
  items.forEach((item, i) => {
    const e = entryFromItem(item, now);
    if (e) entries.push(e);
    else invalid.push(i);
  });
  return { entries, invalid };
}
