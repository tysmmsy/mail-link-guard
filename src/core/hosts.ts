// Host-name helpers shared by the link analysis, the blocklist and the service
// registry. Kept free of browser APIs so the unit tests can run under Node.

/** Lower-cases a host name and drops a trailing root dot ("example.com." -> "example.com"). */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** True when `host` equals `domain` or is one of its subdomains. */
export function isSameOrSubdomain(host: string, domain: string): boolean {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function matchesAnyDomain(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => isSameOrSubdomain(host, d));
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** The WHATWG URL parser already canonicalizes hex/octal IPv4 forms, so a dotted check suffices. */
export function isIpHost(host: string): boolean {
  return IPV4.test(host) || host.startsWith("[");
}

export function hasPunycodeLabel(host: string): boolean {
  return normalizeHost(host)
    .split(".")
    .some((label) => label.startsWith("xn--"));
}

/**
 * Converts user input such as "Example.com", "*.example.com" or a full URL into a host name.
 * Returns null for input that does not look like a host.
 */
export function hostFromInput(input: string): string | null {
  let s = input.trim().normalize("NFKC");
  if (!s) return null;
  s = s.replace(/^\*\./, "");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  const host = normalizeHost(url.hostname);
  if (!host) return null;
  if (!host.includes(".") && !host.startsWith("[")) return null;
  return host;
}
