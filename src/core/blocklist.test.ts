// Unit tests for blocklist normalization, matching and the JSON import/export format.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { domainToASCII } from "node:url";
import { en } from "../locales.ts";
import {
  defaultEntries,
  type EntryType,
  findBlock,
  ImportError,
  makeEntry,
  mergeEntries,
  normalizeValue,
  parseImport,
  toExportJson,
} from "./blocklist.ts";

const NOW = "2026-10-18T00:00:00.000Z";
const entry = (type: EntryType, value: string) => {
  const e = makeEntry(type, value, "", NOW);
  assert.ok(e);
  return e;
};

describe("normalizeValue", () => {
  it("normalizes domains from various inputs", () => {
    assert.equal(normalizeValue("domain", " Example.COM. "), "example.com");
    assert.equal(normalizeValue("domain", "*.example.com"), "example.com");
    assert.equal(normalizeValue("domain", "https://sub.example.com/path?q"), "sub.example.com");
    assert.equal(normalizeValue("domain", "аpple.com"), "xn--pple-43d.com");
    assert.equal(normalizeValue("domain", "localhost"), null);
    assert.equal(normalizeValue("domain", ""), null);
  });

  it("normalizes URLs and drops the fragment", () => {
    assert.equal(normalizeValue("url", "https://Example.com/a#frag"), "https://example.com/a");
    assert.equal(normalizeValue("url", "example.com/a"), null);
    assert.equal(normalizeValue("url", "ftp://example.com/"), null);
  });
});

describe("findBlock", () => {
  const list = [entry("domain", "evil.test"), entry("url", "https://cdn.example.com/phish/")];

  it("matches a domain and its subdomains only", () => {
    assert.ok(findBlock(list, new URL("https://evil.test/")));
    assert.ok(findBlock(list, new URL("https://a.b.evil.test/x")));
    assert.equal(findBlock(list, new URL("https://notevil.test/")), null);
    assert.equal(findBlock(list, new URL("https://evil.test.example.com/")), null);
  });

  it("matches URL entries across case, percent-encoding and a trailing dot", () => {
    const list = [entry("url", "https://contoso.sharepoint.com/sites/ext/")];
    for (const href of [
      "https://contoso.sharepoint.com/SITES/ext/fake",
      "https://contoso.sharepoint.com/sites/%65xt/fake",
      "https://contoso.sharepoint.com/sites/%2565xt/fake",
      "https://contoso.sharepoint.com./sites/ext/fake",
      "https://CONTOSO.sharepoint.com/Sites/Ext/",
    ]) {
      assert.ok(findBlock(list, new URL(href)), href);
    }
    assert.equal(findBlock(list, new URL("https://contoso.sharepoint.com/sites/other/")), null);
  });

  it("tolerates malformed percent sequences", () => {
    const list = [entry("url", "https://a.test/x/")];
    assert.ok(findBlock(list, new URL("https://a.test/x/%E0%A4%A")));
    assert.equal(findBlock(list, new URL("https://a.test/y/%ZZ")), null);
  });

  it("matches URL entries by prefix, ignoring the fragment", () => {
    assert.ok(findBlock(list, new URL("https://cdn.example.com/phish/page#x")));
    assert.equal(findBlock(list, new URL("https://cdn.example.com/other")), null);
  });
});

describe("mergeEntries", () => {
  it("skips duplicates and keeps the existing entry", () => {
    const a = { ...entry("domain", "evil.test"), note: "old" };
    const b = { ...entry("domain", "evil.test"), note: "new" };
    const c = entry("domain", "bad.test");
    const r = mergeEntries([a], [b, c, c]);
    assert.equal(r.added, 1);
    assert.equal(r.duplicates, 2);
    assert.deepEqual(
      r.entries.map((e) => [e.value, e.note]),
      [
        ["evil.test", "old"],
        ["bad.test", ""],
      ],
    );
  });
});

describe("import/export", () => {
  it("round-trips the export file, written one entry per line", () => {
    const list = [entry("domain", "evil.test"), entry("wildcard", "*.amaz0n.*")];
    const json = toExportJson(list, new Date(NOW));
    assert.equal(json.split("\n").filter((l) => l.includes('"type"')).length, 2);
    assert.deepEqual(parseImport(json, NOW), { entries: list, invalid: [] });
    assert.deepEqual(parseImport(toExportJson([], new Date(NOW)), NOW).entries, []);
  });

  it("accepts a bare array of strings and guesses the type", () => {
    const r = parseImport(
      JSON.stringify(["evil.test", "https://x.test/path", "https://y.test"]),
      NOW,
    );
    assert.deepEqual(
      r.entries.map((e) => [e.type, e.value]),
      [
        ["domain", "evil.test"],
        ["url", "https://x.test/path"],
        ["domain", "y.test"],
      ],
    );
  });

  it("reports invalid items without rejecting the file", () => {
    const r = parseImport(
      JSON.stringify({
        entries: [{ type: "domain", value: "ok.test" }, { value: 1 }, "localhost"],
      }),
      NOW,
    );
    assert.equal(r.entries.length, 1);
    assert.deepEqual(r.invalid, [1, 2]);
  });

  it("keeps notes and valid timestamps, truncating long notes", () => {
    const r = parseImport(
      JSON.stringify([
        { type: "domain", value: "a.test", note: "n".repeat(300), addedAt: "2025-01-01T00:00:00Z" },
      ]),
      NOW,
    );
    assert.equal(r.entries[0].note.length, 200);
    assert.equal(r.entries[0].addedAt, "2025-01-01T00:00:00Z");
  });

  it("rejects unusable files", () => {
    const code = (text: string) => {
      try {
        parseImport(text, NOW);
        return "ok";
      } catch (e) {
        assert.ok(e instanceof ImportError);
        return e.message;
      }
    };
    assert.equal(code("{"), "not-json");
    assert.equal(code('{"a":1}'), "wrong-format");
    assert.equal(code('{"format":"other","entries":[]}'), "wrong-format");
    assert.equal(
      code('{"format":"mail-link-guard/blocklist","version":2,"entries":[]}'),
      "newer-version",
    );
    assert.equal(code(JSON.stringify(Array(10_001).fill("a.test"))), "too-many");
  });
});

describe("wildcard and regex entries", () => {
  const ascii = (unicodeHost: string, path = "/") => new URL(`https://${unicodeHost}${path}`);

  it("validates patterns", () => {
    assert.equal(normalizeValue("wildcard", "*.Example.*"), "*.example.*");
    assert.equal(normalizeValue("wildcard", "example.com"), null);
    assert.equal(normalizeValue("wildcard", "**"), null);
    assert.equal(normalizeValue("regex", "/paypa[l1]/i"), "paypa[l1]");
    assert.equal(normalizeValue("regex", "("), null);
    assert.equal(normalizeValue("regex", "a".repeat(501)), null);
  });

  it("matches a wildcard without a slash against the host only", () => {
    const list = [entry("wildcard", "*.amaz0n.*")];
    assert.ok(findBlock(list, new URL("https://www.amaz0n.co.jp/x")));
    assert.equal(findBlock(list, new URL("https://example.com/?q=www.amaz0n.com")), null);
  });

  it("matches wildcards with a path or a scheme against the URL", () => {
    assert.ok(
      findBlock([entry("wildcard", "*/wp-admin/*")], new URL("https://a.test/wp-admin/x.php")),
    );
    assert.ok(findBlock([entry("wildcard", "http://*")], new URL("http://a.test/")));
    assert.equal(findBlock([entry("wildcard", "http://*")], new URL("https://a.test/")), null);
  });

  it("tests a wildcard against at most 4,096 characters of the host", () => {
    const list = [entry("wildcard", "*-login-*.example")];
    const long = new URL(`https://${"-login-".repeat(20_000)}x.test/`);
    const start = performance.now();
    assert.equal(findBlock(list, long), null);
    assert.ok(performance.now() - start < 200);
    assert.ok(findBlock(list, new URL("https://a-login-b.example/")));
  });

  it("lets a wildcard catch any host containing a character, in its real form", () => {
    const list = [entry("wildcard", "*α*")];
    assert.ok(findBlock(list, ascii("αmazon.co.jp")));
    assert.ok(findBlock(list, ascii("shop.αpple.example")));
    assert.equal(findBlock(list, ascii("amazon.co.jp")), null);
  });

  it("tests a regex against the URL in both forms, ignoring case", () => {
    const list = [entry("regex", "^https://[^/]*PAYPA[L1]\\.")];
    assert.ok(findBlock(list, new URL("https://www.paypa1.example/login")));
    assert.equal(findBlock(list, new URL("https://example.com/paypal.")), null);
  });

  it("skips an entry whose pattern no longer compiles", () => {
    const broken = { type: "regex" as const, value: "(", note: "", addedAt: NOW };
    assert.equal(findBlock([broken, entry("domain", "a.test")], new URL("https://b.test/")), null);
  });

  it("guesses the type of bare strings in an import", () => {
    const r = parseImport(JSON.stringify(["*.evil.*", "/evil\\d+/", "evil.test"]), NOW);
    assert.deepEqual(
      r.entries.map((e) => [e.type, e.value]),
      [
        ["wildcard", "*.evil.*"],
        ["regex", "evil\\d+"],
        ["domain", "evil.test"],
      ],
    );
  });
});

describe("defaultEntries", () => {
  const blocked = (host: string) =>
    findBlock(
      defaultEntries(NOW, (key) => en[key]),
      new URL(`https://${host}/ap/signin`),
    ) !== null;

  it("blocks Amazon lookalikes written with Greek letters", () => {
    assert.ok(blocked(domainToASCII("αmazon.co.jp")));
    assert.ok(blocked(domainToASCII("www.amazοn.com")));
    assert.ok(blocked(domainToASCII("amaζon.jp")));
  });

  it("blocks any domain that mixes Latin with Greek or Cyrillic in one label", () => {
    assert.ok(blocked(domainToASCII("pаypal.com")));
    assert.ok(blocked(domainToASCII("login.gοogle.com")));
    assert.ok(blocked(domainToASCII("аmazon.co.jp")));
  });

  it("blocks a label written only with Latin-looking Greek or Cyrillic letters", () => {
    assert.ok(blocked(domainToASCII("аррӏе.com")));
    assert.ok(blocked(domainToASCII("www.ехро.com")));
  });

  it("blocks credentials in the URL, IP-address hosts and .zip/.mov domains", () => {
    assert.ok(blocked("paypal.com@evil.test"));
    assert.ok(blocked("192.168.0.1"));
    assert.ok(blocked("[::1]"));
    assert.ok(blocked("invoice.zip"));
    assert.ok(blocked("trailer.mov"));
    assert.ok(blocked("invoice.zip."));
    assert.ok(blocked("192.168.0.1."));
  });

  it("leaves file links, e-mail-like queries and ordinary hosts alone", () => {
    const ok = (href: string) =>
      findBlock(
        defaultEntries(NOW, (key) => en[key]),
        new URL(href),
      ) === null;
    assert.ok(ok("https://github.com/a/b/releases/v1.zip"));
    assert.ok(ok("https://example.com/unsubscribe?email=a@b.example"));
    assert.ok(ok("https://www.amazon.co.jp/"));
  });

  it("leaves ordinary Russian, Greek, Japanese and accented domains alone", () => {
    for (const host of ["пример.рф", "яндекс.рф", "αλφα.gr", "例え.jp", "bücher.de", "café.fr"]) {
      assert.equal(blocked(domainToASCII(host)), false, host);
    }
  });

  it("leaves the real Amazon and unrelated Greek domains alone", () => {
    assert.equal(blocked("www.amazon.co.jp"), false);
    assert.equal(blocked(domainToASCII("αλφα.example")), false);
  });
});
