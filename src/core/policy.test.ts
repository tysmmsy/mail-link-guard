// Unit tests for reading the organization's policy and laying it over user settings.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findBlock, makeEntry } from "./blocklist.ts";
import { effectiveSettings, NO_POLICY, normalizePolicy } from "./policy.ts";
import { defaultSettings } from "./settings.ts";

describe("normalizePolicy", () => {
  it("returns no policy for empty managed storage", () => {
    assert.deepEqual(normalizePolicy({}), { ...NO_POLICY, enforcedEnabled: undefined });
  });

  it("reads valid values and drops malformed entries", () => {
    const p = normalizePolicy({
      enforcedEnabled: true,
      allowUserBlocklist: false,
      enforcedBlocklist: [
        { type: "domain", value: "Evil.Example", note: "phishing" },
        { type: "regex", value: "(" },
        { type: "unknown", value: "x" },
        "evil.test",
        { type: "wildcard", value: "*α*" },
      ],
    });
    assert.equal(p.enforcedEnabled, true);
    assert.equal(p.allowUserBlocklist, false);
    assert.deepEqual(
      p.enforcedBlocklist.map((e) => [e.type, e.value, e.note]),
      [
        ["domain", "evil.example", "phishing"],
        ["wildcard", "*α*", ""],
      ],
    );
  });

  it("reads the organization's allowlist, including shared-host tenants", () => {
    const p = normalizePolicy({
      allowUserAllowlist: false,
      enforcedAllowlist: [
        { host: "corp.sharepoint.com", note: "our tenant" },
        { host: "example.com", includeSubdomains: true },
        { host: "1.2.3.4" },
        { nothost: "x" },
      ],
    });
    assert.equal(p.allowUserAllowlist, false);
    assert.deepEqual(
      p.enforcedAllowlist.map((e) => [e.host, e.includeSubdomains]),
      [
        ["corp.sharepoint.com", false],
        ["example.com", true],
      ],
    );
  });

  it("ignores values of the wrong type", () => {
    const p = normalizePolicy({ enforcedEnabled: "yes", allowUserBlocklist: 0 });
    assert.equal(p.enforcedEnabled, undefined);
    assert.equal(p.allowUserBlocklist, true);
  });
});

describe("effectiveSettings", () => {
  const own = makeEntry("domain", "mine.test", "", "2026-10-18T00:00:00Z");
  const settings = { ...defaultSettings(), enabled: false, blocklist: own ? [own] : [] };
  const policy = normalizePolicy({
    enforcedEnabled: true,
    enforcedBlocklist: [{ type: "domain", value: "corp-banned.test" }],
  });

  it("locks the switch and puts enforced entries first", () => {
    const e = effectiveSettings(settings, policy);
    assert.equal(e.enabled, true);
    assert.deepEqual(
      e.blocklist.map((x) => x.value),
      ["corp-banned.test", "mine.test"],
    );
    const hit = findBlock(e.blocklist, new URL("https://corp-banned.test/"));
    assert.ok(hit && e.isEnforced(hit));
    const mine = findBlock(e.blocklist, new URL("https://mine.test/"));
    assert.ok(mine && !e.isEnforced(mine));
  });

  it("drops the user's entries when the organization does not allow them", () => {
    const e = effectiveSettings(settings, { ...policy, allowUserBlocklist: false });
    assert.deepEqual(
      e.blocklist.map((x) => x.value),
      ["corp-banned.test"],
    );
  });

  it("drops the user's allowlist when the organization does not allow it", () => {
    const withAllow = {
      ...settings,
      allowlist: [{ host: "a.test", includeSubdomains: false, note: "", addedAt: "" }],
    };
    assert.equal(effectiveSettings(withAllow, NO_POLICY).allowlist.length, 1);
    assert.equal(
      effectiveSettings(withAllow, { ...NO_POLICY, allowUserAllowlist: false }).allowlist.length,
      0,
    );
  });

  it("leaves the user's choice alone without a policy", () => {
    assert.equal(effectiveSettings(settings, NO_POLICY).enabled, false);
  });
});
