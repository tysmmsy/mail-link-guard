// The allowlist: sites whose links open without the confirmation dialog. It is the
// riskiest setting in the extension, so the rules here are deliberately narrow:
// - entries are host names only (no URLs, wildcards or regexes), exact by default;
// - hosts where anyone can publish pages, and URL shorteners, cannot be added by users;
// - a link is let through only when it raises no format note, uses plain HTTPS on the
//   default port, and carries no other URL that could be a redirect;
// - the blocklist always wins (checked by the caller before this).
// Entries are added only from the options page, never from the in-page dialog.

import { hostFromInput, isIpHost, isSameOrSubdomain, matchesAnyDomain } from "./hosts.ts";
import type { LinkAnalysis } from "./link.ts";
import { SHARED_HOSTING } from "./shared-hosting.ts";

export interface AllowEntry {
  host: string;
  includeSubdomains: boolean;
  note: string;
  /** ISO 8601 timestamp; empty for entries from the organization's policy. */
  addedAt: string;
  /** Set on entries from the organization's policy, which may name a shared-hosting tenant. */
  enforced?: boolean;
}

export const MAX_ALLOW_ENTRIES = 1_000;

export type AllowError = "invalid" | "shared-host" | "shared-parent";

export type AllowResult = { entry: AllowEntry } | { error: AllowError; detail?: string };

/**
 * Validates an entry. User entries may not name a shared-hosting site, and may not
 * include subdomains when that would cover one (e.g. "google.com" + subdomains covers
 * sites.google.com). Entries from the organization's policy skip the shared-hosting
 * checks, since an administrator may need to allow its own tenant (e.g. a SharePoint host).
 */
export function makeAllowEntry(
  input: string,
  includeSubdomains: boolean,
  note: string,
  addedAt: string,
  { enforced = false } = {},
): AllowResult {
  const host = hostFromInput(input);
  if (!host || isIpHost(host)) return { error: "invalid" };
  if (!enforced) {
    if (matchesAnyDomain(host, SHARED_HOSTING)) return { error: "shared-host" };
    if (includeSubdomains) {
      const covered = SHARED_HOSTING.find((d) => isSameOrSubdomain(d, host));
      if (covered) return { error: "shared-parent", detail: covered };
    }
  }
  const entry: AllowEntry = { host, includeSubdomains, note: note.trim().slice(0, 200), addedAt };
  if (enforced) entry.enforced = true;
  return { entry };
}

export function allowKey(e: Pick<AllowEntry, "host" | "includeSubdomains">): string {
  return `${e.includeSubdomains ? "*." : ""}${e.host}`;
}

/**
 * True when the path, a query value or the fragment carries another URL: a possible
 * redirect. Covers "https://", protocol-relative "//host", backslash forms browsers treat
 * as slashes ("\\host", "/\\host"), and their percent-encoded variants.
 */
export function carriesUrl(url: URL): boolean {
  const pattern = /[\\/]{2}|(?:%2f|%5c){2}/i;
  // The path always starts with one "/", so only a second slash right after counts.
  if (pattern.test(url.pathname)) return true;
  for (const value of url.searchParams.values()) if (pattern.test(value)) return true;
  return pattern.test(decodeSafe(url.hash));
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function hostAllowed(entries: readonly AllowEntry[], host: string): AllowEntry | null {
  for (const e of entries) {
    if (e.includeSubdomains ? isSameOrSubdomain(host, e.host) : host === e.host) return e;
  }
  return null;
}

/**
 * The allowlist entry that lets this link skip the dialog, or null. The caller must
 * have checked the blocklist first.
 */
export function allowedToSkip(
  entries: readonly AllowEntry[],
  analysis: LinkAnalysis,
): AllowEntry | null {
  if (entries.length === 0) return null;
  const d = analysis.destination;
  if (d.protocol !== "https:" || d.port !== "" || carriesUrl(d)) return null;
  const entry = hostAllowed(entries, d.hostname);
  if (!entry) return null;
  // The shared-host note is expected for an organization's own tenant (for example
  // contoso.sharepoint.com), which only policy entries may name. Any other note still
  // shows the dialog.
  const notes = entry.enforced ? analysis.notes.filter((n) => n !== "shared-host") : analysis.notes;
  return notes.length === 0 ? entry : null;
}
