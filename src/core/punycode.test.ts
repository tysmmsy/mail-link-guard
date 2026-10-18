// Unit tests for Punycode decoding, checked against Node's own IDN conversion.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { domainToASCII, domainToUnicode } from "node:url";
import { toUnicodeHost } from "./punycode.ts";

describe("toUnicodeHost", () => {
  it("matches Node's conversion for mixed-script and non-Latin hosts", () => {
    for (const unicode of [
      "αmazon.co.jp",
      "amazοn.com",
      "аpple.com",
      "例え.テスト",
      "bücher.example",
      "xn--ok.example",
    ]) {
      const ascii = domainToASCII(unicode) || unicode;
      assert.equal(toUnicodeHost(ascii), domainToUnicode(ascii) || ascii, unicode);
    }
  });

  it("leaves ASCII hosts and malformed labels unchanged", () => {
    assert.equal(toUnicodeHost("www.example.com"), "www.example.com");
    assert.equal(toUnicodeHost("xn--!!.example"), "xn--!!.example");
  });
});
