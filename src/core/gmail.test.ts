// Unit tests for the Gmail host check, the manifest it must agree with, and the locales.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { en, locales } from "../locales.ts";
import { GMAIL_HOST, isGmailHost } from "./gmail.ts";

describe("isGmailHost", () => {
  it("accepts only mail.google.com", () => {
    assert.equal(isGmailHost("mail.google.com"), true);
    assert.equal(isGmailHost("MAIL.google.com."), true);
    assert.equal(isGmailHost("google.com"), false);
    assert.equal(isGmailHost("mail.google.com.evil.test"), false);
    assert.equal(isGmailHost(""), false);
  });
});

describe("manifest", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../static/manifest.json", import.meta.url), "utf8"),
  );

  it("injects the content script on Gmail only", () => {
    assert.deepEqual(manifest.content_scripts[0].matches, [`https://${GMAIL_HOST}/*`]);
  });

  it("requests only storage and no host or network access", () => {
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(manifest.optional_host_permissions, undefined);
    assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  });
});

describe("locales", () => {
  it("has the same keys in every locale and no empty messages", () => {
    for (const [code, messages] of Object.entries(locales)) {
      assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort(), code);
      for (const [k, v] of Object.entries(messages)) assert.ok(v.trim(), `${code}.${k} is empty`);
      // The Chrome Web Store rejects a manifest description longer than 132 characters.
      assert.ok([...messages.extDescription].length <= 132, `${code}.extDescription is too long`);
    }
  });
});
