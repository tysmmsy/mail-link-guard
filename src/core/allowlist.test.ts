// Unit tests for the allowlist: what may be added, and when a link may skip the dialog.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AllowEntry, allowedToSkip, makeAllowEntry } from "./allowlist.ts";
import { analyzeLink } from "./link.ts";

const NOW = "2026-10-18T00:00:00.000Z";
const entry = (host: string, sub = false): AllowEntry => {
  const r = makeAllowEntry(host, sub, "", NOW);
  assert.ok("entry" in r, host);
  return r.entry;
};
const skip = (list: AllowEntry[], href: string, text = "") => {
  const a = analyzeLink(href, text);
  assert.ok(a);
  return allowedToSkip(list, a) !== null;
};

describe("makeAllowEntry", () => {
  it("normalizes a host and rejects invalid input and IP addresses", () => {
    assert.equal(entry(" WWW.Example.com ").host, "www.example.com");
    assert.deepEqual(makeAllowEntry("not a host", false, "", NOW), { error: "invalid" });
    assert.deepEqual(makeAllowEntry("192.168.0.1", false, "", NOW), { error: "invalid" });
  });

  it("refuses shared-hosting sites and URL shorteners", () => {
    for (const host of ["sites.google.com", "evil.github.io", "corp.sharepoint.com", "bit.ly"]) {
      assert.deepEqual(makeAllowEntry(host, false, "", NOW), { error: "shared-host" }, host);
    }
  });

  it("refuses subdomains when they would cover a shared-hosting site", () => {
    const r = makeAllowEntry("google.com", true, "", NOW);
    assert.ok("error" in r && r.error === "shared-parent");
    assert.ok("entry" in makeAllowEntry("google.com", false, "", NOW));
    assert.ok("entry" in makeAllowEntry("example.com", true, "", NOW));
  });

  it("lets the organization allow its own tenant on a shared host", () => {
    assert.ok("entry" in makeAllowEntry("corp.sharepoint.com", false, "", "", { enforced: true }));
  });
});

describe("allowedToSkip", () => {
  const list = [entry("www.example.com"), entry("example.org", true)];

  it("lets a plain HTTPS link to an allowed host through", () => {
    assert.ok(skip(list, "https://www.example.com/news", "Read the news"));
    assert.ok(skip(list, "https://shop.example.org/", ""));
  });

  it("matches the exact host unless subdomains were allowed", () => {
    assert.equal(skip(list, "https://example.com/"), false);
    assert.equal(skip(list, "https://login.www.example.com/"), false);
  });

  it("still shows the dialog when anything about the link is suspicious", () => {
    assert.equal(skip(list, "http://www.example.com/"), false);
    assert.equal(skip(list, "https://www.example.com:8443/"), false);
    assert.equal(skip(list, "https://www.example.com/", "https://bank.test/"), false);
    assert.equal(skip(list, "https://www.example.com/r?url=https://evil.test/"), false);
    assert.equal(skip(list, "https://www.example.com/out?https://evil.test/"), false);
    assert.equal(skip(list, "https://www.example.com/login?next=/%09/evil.test"), false);
    assert.equal(skip(list, "https://www.example.com/news?id=1"), false);
    assert.equal(skip(list, "https://www.example.com/page#top"), false);
    assert.equal(skip(list, "https://www.example.com/go/https:%2F%2Fevil.test"), false);
    assert.equal(skip(list, "https://user@www.example.com/"), false);
  });

  it("lets an organization's shared-host tenant through, but not a user's", () => {
    const r = makeAllowEntry("contoso.sharepoint.com", false, "", "", { enforced: true });
    assert.ok("entry" in r);
    assert.ok(skip([r.entry], "https://contoso.sharepoint.com/sites/team"));
    assert.equal(skip([{ ...r.entry, enforced: false }], "https://contoso.sharepoint.com/"), false);
    // Other notes still show the dialog for policy entries.
    assert.equal(skip([r.entry], "https://contoso.sharepoint.com/", "https://bank.test/"), false);
  });

  it("judges the destination after removing a redirect wrapper", () => {
    assert.ok(skip(list, "https://www.google.com/url?q=https://www.example.com/a"));
    assert.equal(skip(list, "https://www.google.com/url?q=https://evil.test/"), false);
  });
});
