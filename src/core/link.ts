// Pure analysis of a clicked link: resolves the effective destination (unwrapping
// redirect wrappers that mail services add) and lists neutral format notes for the
// confirmation dialog. Kept free of DOM and chrome APIs so it is unit-testable.

import { hasPunycodeLabel, isIpHost, isSameOrSubdomain, matchesAnyDomain } from "./hosts.ts";
import { toUnicodeHost } from "./punycode.ts";

export type NoteKind =
  | "text-mismatch"
  | "insecure"
  | "ip-host"
  | "punycode"
  | "shortener"
  | "credentials";

export interface LinkAnalysis {
  /** The href exactly as the browser resolved it from the anchor. */
  href: string;
  /** Destination after removing known wrappers; equals `href` when nothing was unwrapped. */
  destination: URL;
  /** Name of the wrapper that was removed, for the dialog to explain what it shows. */
  wrapper: WrapperName | null;
  /** Visible anchor text, whitespace-collapsed and truncated. */
  text: string;
  /** The destination host with Punycode labels decoded, as a person would read it. */
  unicodeHost: string;
  /** Host written in the visible text, when the text looks like a URL or domain. */
  textHost: string | null;
  notes: NoteKind[];
}

export type WrapperName = "google-redirect" | "outlook-safelinks";

export const SHORTENER_DOMAINS: readonly string[] = [
  "bit.ly",
  "bitly.com",
  "buff.ly",
  "cutt.ly",
  "goo.gl",
  "is.gd",
  "lnkd.in",
  "ow.ly",
  "rb.gy",
  "rebrand.ly",
  "shorturl.at",
  "t.co",
  "t.ly",
  "tiny.cc",
  "tinyurl.com",
  "v.gd",
  "x.gd",
];

const MAX_TEXT = 200;
const MAX_UNWRAP_DEPTH = 3;

export function parseHttpUrl(raw: string, base?: string): URL | null {
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function unwrapOnce(url: URL): { inner: URL; wrapper: WrapperName } | null {
  const host = url.hostname.toLowerCase();
  if ((host === "www.google.com" || host === "google.com") && url.pathname === "/url") {
    const inner = parseHttpUrl(url.searchParams.get("q") ?? url.searchParams.get("url") ?? "");
    return inner ? { inner, wrapper: "google-redirect" } : null;
  }
  if (isSameOrSubdomain(host, "safelinks.protection.outlook.com")) {
    const inner = parseHttpUrl(url.searchParams.get("url") ?? "");
    return inner ? { inner, wrapper: "outlook-safelinks" } : null;
  }
  return null;
}

/** Removes nested redirect wrappers. The first wrapper found is the one reported. */
export function unwrap(url: URL): { destination: URL; wrapper: WrapperName | null } {
  let current = url;
  let wrapper: WrapperName | null = null;
  for (let i = 0; i < MAX_UNWRAP_DEPTH; i++) {
    const step = unwrapOnce(current);
    if (!step) break;
    wrapper ??= step.wrapper;
    current = step.inner;
  }
  return { destination: current, wrapper };
}

export function cleanText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_TEXT ? `${collapsed.slice(0, MAX_TEXT)}…` : collapsed;
}

// A host-like token: dotted labels ending in a letter TLD, or a dotted IPv4 address.
const HOST_IN_TEXT =
  /(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}|\d{1,3}(?:\.\d{1,3}){3})(?![a-z0-9-])/i;

/**
 * Finds a host written in the visible text. Full-width characters are folded first so
 * "ｅｘａｍｐｌｅ．ｃｏｍ" is read as example.com. Text that is an e-mail address is ignored,
 * because mail clients link addresses to unrelated tracking or compose URLs.
 */
export function hostInText(text: string): string | null {
  const folded = text.normalize("NFKC").replace(/。/g, ".");
  const m = HOST_IN_TEXT.exec(folded);
  if (!m) return null;
  const before = folded.slice(0, m.index);
  if (before.endsWith("@")) return null;
  return m[1].toLowerCase();
}

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

function hostsRelated(a: string, b: string): boolean {
  const x = stripWww(a.toLowerCase());
  const y = stripWww(b.toLowerCase());
  return isSameOrSubdomain(x, y) || isSameOrSubdomain(y, x);
}

export function analyzeLink(rawHref: string, rawText: string, base?: string): LinkAnalysis | null {
  const url = parseHttpUrl(rawHref, base);
  if (!url) return null;
  const { destination, wrapper } = unwrap(url);
  const text = cleanText(rawText);
  const textHost = hostInText(text);
  const host = destination.hostname;

  const notes: NoteKind[] = [];
  if (textHost && !hostsRelated(textHost, host)) notes.push("text-mismatch");
  if (destination.protocol === "http:") notes.push("insecure");
  if (isIpHost(host)) notes.push("ip-host");
  if (hasPunycodeLabel(host)) notes.push("punycode");
  if (matchesAnyDomain(host, SHORTENER_DOMAINS)) notes.push("shortener");
  if (destination.username || destination.password) notes.push("credentials");

  return {
    href: url.href,
    destination,
    wrapper,
    text,
    unicodeHost: toUnicodeHost(host),
    textHost,
    notes,
  };
}
