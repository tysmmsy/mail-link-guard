// Pure analysis of a clicked link: resolves the effective destination (unwrapping
// redirect wrappers that mail services add) and lists neutral format notes for the
// confirmation dialog. Kept free of DOM and chrome APIs so it is unit-testable.

import {
  hasPunycodeLabel,
  isIpHost,
  isSameOrSubdomain,
  matchesAnyDomain,
  normalizeHost,
} from "./hosts.ts";
import { toUnicodeHost } from "./punycode.ts";
import { SHARED_HOSTING } from "./shared-hosting.ts";
import { SHORTENER_DOMAINS } from "./shorteners.ts";

export { SHORTENER_DOMAINS };

export type NoteKind =
  | "text-mismatch"
  | "insecure"
  | "ip-host"
  | "punycode"
  | "shortener"
  | "credentials"
  | "shared-host"
  | "redirect-target";

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
  /** Another site the URL appears to forward to (open-redirect style), if any. */
  redirectTarget: string | null;
  notes: NoteKind[];
}

export type WrapperName = "google-redirect" | "outlook-safelinks";

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

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// After a double slash or backslash ("//host", "\\host", "/\\host"), or right after a
// scheme without slashes ("https:host"): the host part of an embedded URL.
// "//host", "\\\\host", or a scheme followed by zero or one slash ("https:host", "https:/host").
const EMBEDDED_AUTHORITY =
  /(?:[\\/]{2}|\bhttps?:[\\/]?(?=[^\\/]))(\[[0-9a-f:.]+\]|[^\s\\/?#&=]+)/gi;

/**
 * The host of an authority such as "user:pw@evil.example:8443", in the same ASCII
 * (Punycode) form the URL parser gives the destination, or null if it is not a host.
 */
function hostOfAuthority(authority: string): string | null {
  if (authority.startsWith("[")) return authority.toLowerCase();
  const afterUserinfo = authority.slice(authority.lastIndexOf("@") + 1);
  const raw = afterUserinfo.replace(/:\d*$/, "").replace(/\.$/, "");
  if (!raw.includes(".") && !raw.includes("。")) return null;
  try {
    return normalizeHost(new URL(`https://${raw}/`).hostname);
  } catch {
    return null;
  }
}

/**
 * The host of another site this URL appears to hand to a redirector, read from the
 * decoded path, query (keys and values) and fragment, or null. Tab, CR and LF are removed
 * first because browsers drop them from URLs ("/\t/evil.example" acts as "//evil.example").
 * Every candidate is checked, so a same-site URL earlier in the string cannot hide an
 * off-site one later.
 */
export function embeddedTarget(url: URL): string | null {
  // The path keeps its leading "/", which with a following "/" (or a tab-split "/\t/")
  // forms a protocol-relative URL at the start of the path.
  const parts = [url.pathname, url.search.slice(1), url.hash.slice(1)];
  for (const raw of parts) {
    if (!raw) continue;
    // Decode twice to catch double encoding, as many redirectors decode again.
    const text = decodeSafe(decodeSafe(raw.replace(/\+/g, " "))).replace(/[\t\r\n]/g, "");
    for (const m of text.matchAll(EMBEDDED_AUTHORITY)) {
      const host = hostOfAuthority(m[1]);
      // Same site in either direction, ignoring "www.", is an in-site redirect.
      if (host && !hostsRelated(host, url.hostname)) return host;
    }
  }
  return null;
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
  else if (matchesAnyDomain(host, SHARED_HOSTING)) notes.push("shared-host");
  if (destination.username || destination.password) notes.push("credentials");
  const redirectTarget = embeddedTarget(destination);
  if (redirectTarget) notes.push("redirect-target");

  return {
    href: url.href,
    destination,
    wrapper,
    text,
    unicodeHost: toUnicodeHost(host),
    textHost,
    redirectTarget,
    notes,
  };
}
