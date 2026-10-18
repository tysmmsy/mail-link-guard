// Unit tests for link analysis: unwrapping and the format notes shown in the dialog.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeLink, hostInText, unwrap } from "./link.ts";

const notesOf = (href: string, text = "") => analyzeLink(href, text)?.notes ?? null;

describe("analyzeLink", () => {
  it("ignores non-HTTP links", () => {
    assert.equal(analyzeLink("mailto:a@example.com", "a@example.com"), null);
    assert.equal(analyzeLink("javascript:void(0)", "x"), null);
    assert.equal(analyzeLink("not a url", "x"), null);
  });

  it("reports no notes for a plain HTTPS link with unrelated text", () => {
    assert.deepEqual(notesOf("https://example.com/news", "Read the news"), []);
  });

  it("flags text that names a different domain", () => {
    assert.deepEqual(notesOf("https://evil.example.net/login", "https://bank.example.com/"), [
      "text-mismatch",
    ]);
  });

  it("accepts text that names the same site, a subdomain or the www form", () => {
    assert.deepEqual(notesOf("https://www.example.com/a", "example.com"), []);
    assert.deepEqual(notesOf("https://shop.example.com/a", "www.example.com"), []);
    assert.deepEqual(notesOf("https://example.com/a", "https://shop.example.com"), []);
  });

  it("reads full-width text as a host", () => {
    assert.deepEqual(notesOf("https://evil.test/", "ｅｘａｍｐｌｅ．ｃｏｍ"), ["text-mismatch"]);
  });

  it("does not treat an e-mail address in the text as a host", () => {
    assert.deepEqual(notesOf("https://tracker.example.net/c", "support@example.com"), []);
  });

  it("flags HTTP, IP hosts, punycode, shorteners and credentials", () => {
    assert.deepEqual(notesOf("http://example.com/"), ["insecure"]);
    assert.deepEqual(notesOf("https://192.168.0.1/"), ["ip-host"]);
    assert.deepEqual(notesOf("https://0x7f.1/"), ["ip-host"]);
    assert.deepEqual(notesOf("https://[::1]/"), ["ip-host"]);
    assert.deepEqual(notesOf("https://аpple.com/"), ["punycode"]);
    assert.deepEqual(notesOf("https://bit.ly/abc"), ["shortener"]);
    assert.deepEqual(notesOf("https://paypal.com@evil.test/"), ["credentials"]);
  });

  it("warns about sites where anyone can publish pages", () => {
    assert.deepEqual(notesOf("https://sites.google.com/view/account-check"), ["shared-host"]);
    assert.deepEqual(notesOf("https://evil.github.io/login"), ["shared-host"]);
    assert.deepEqual(notesOf("https://accounts.google.com/"), []);
  });

  it("truncates long link text", () => {
    const a = analyzeLink("https://example.com/", "x".repeat(500));
    assert.equal(a?.text.length, 201);
  });
});

describe("unwrap", () => {
  it("removes the Google redirect", () => {
    const r = unwrap(new URL("https://www.google.com/url?q=https://evil.test/x&sa=D"));
    assert.equal(r.destination.href, "https://evil.test/x");
    assert.equal(r.wrapper, "google-redirect");
  });

  it("removes Outlook Safe Links", () => {
    const inner = encodeURIComponent("https://evil.test/login?a=1");
    const r = unwrap(
      new URL(`https://nam12.safelinks.protection.outlook.com/?url=${inner}&data=x`),
    );
    assert.equal(r.destination.href, "https://evil.test/login?a=1");
    assert.equal(r.wrapper, "outlook-safelinks");
  });

  it("leaves a wrapper whose target is not HTTP", () => {
    const r = unwrap(new URL("https://www.google.com/url?q=javascript:alert(1)"));
    assert.equal(r.destination.hostname, "www.google.com");
    assert.equal(r.wrapper, null);
  });

  it("reports notes about the unwrapped destination", () => {
    const a = analyzeLink("https://www.google.com/url?q=http://bit.ly/x", "");
    assert.deepEqual(a?.notes, ["insecure", "shortener"]);
  });
});

describe("hostInText", () => {
  it("finds a host inside a sentence", () => {
    assert.equal(hostInText("Log in at secure.example.com today"), "secure.example.com");
  });
  it("returns null for ordinary words", () => {
    assert.equal(hostInText("Click here"), null);
    assert.equal(hostInText("version 1.2.3"), null);
  });
});
