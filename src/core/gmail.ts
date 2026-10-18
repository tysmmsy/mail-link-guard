// Where the extension runs and which links it holds. Gmail is the only supported
// webmail; GMAIL_HOST must match content_scripts.matches in static/manifest.json
// (a unit test checks it).

import { normalizeHost } from "./hosts.ts";

export const GMAIL_HOST = "mail.google.com";

/**
 * The container Gmail renders each message body into. Links inside it are confirmed;
 * links in Gmail's own interface pass unless their destination is blocklisted.
 */
export const BODY_SELECTOR = ".a3s";

export function isGmailHost(host: string): boolean {
  return normalizeHost(host) === GMAIL_HOST;
}
