// End-to-end test: loads the built extension into Chromium and drives a fake Gmail page
// (served for https://mail.google.com through request routing) to check the real dialog,
// blocking, and the options page import/export.

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { type BrowserContext, chromium, type Page, type Worker } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const fixture = await readFile(join(root, "e2e/fixtures/gmail.html"), "utf8");

/** Every HTTP(S) request the browser made, to prove the extension sends nothing. */
const requests: string[] = [];
let context: BrowserContext;
let worker: Worker;
let extensionId: string;

async function setStorage(values: Record<string, unknown>) {
  await worker.evaluate((v) => chrome.storage.local.set(v), values);
}
async function getBlocklist(): Promise<{ type: string; value: string; note: string }[]> {
  return worker.evaluate(
    async () =>
      (await chrome.storage.local.get("blocklist")).blocklist as {
        type: string;
        value: string;
        note: string;
      }[],
  );
}

async function getStorage(key: string): Promise<unknown> {
  return worker.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key);
}

async function openGmail(): Promise<Page> {
  const page = await context.newPage();
  await page.goto("https://mail.google.com/mail/u/0/");
  // Settings load asynchronously at document_start; wait until the gate is armed.
  await page.waitForTimeout(300);
  return page;
}

const dialog = (page: Page) => page.locator("[data-mail-link-guard] .dialog");

before(async () => {
  context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mlg-")), {
    channel: "chromium",
    headless: true,
    locale: "en-US",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (!url.protocol.startsWith("http")) return route.continue();
    requests.push(url.href);
    if (url.hostname === "mail.google.com") {
      return route.fulfill({ contentType: "text/html", body: fixture });
    }
    return route.fulfill({ contentType: "text/html", body: `<title>${url.hostname}</title>` });
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
});

after(async () => {
  await context?.close();
});

describe("first install", () => {
  it("starts with the default Amazon lookalike entry and blocks such a link", async () => {
    // onInstalled runs asynchronously right after the browser starts.
    let list = await getBlocklist();
    for (let i = 0; !list && i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      list = await getBlocklist();
    }
    assert.equal(list.length, 6);
    assert.ok(list.every((e) => e.type === "regex"));
    const page = await openGmail();
    await page.click("#greek");
    await dialog(page).locator(".message").waitFor();
    assert.equal(await dialog(page).locator(".host").textContent(), "αmazon.co.jp");
    assert.equal(await dialog(page).locator("[data-action=open]").count(), 0);
    await page.close();
  });
});

describe("organization policy", () => {
  it("accepts the managed storage schema", async () => {
    // An invalid schema makes Chrome reject reads from chrome.storage.managed.
    const managed = await worker.evaluate(() => chrome.storage.managed.get(null));
    assert.deepEqual(managed, {});
  });
});

describe("Gmail page", () => {
  it("holds a body link and shows the real destination", async () => {
    await setStorage({ blocklist: [] });
    const page = await openGmail();
    await page.click("#mismatch");
    await dialog(page).waitFor();
    assert.equal(await dialog(page).locator(".host").textContent(), "evil.test");
    const notes = await dialog(page).locator(".notes li").allTextContents();
    assert.ok(
      notes.some((n) => n.includes("bank.example.com")),
      notes.join(" / "),
    );
    assert.equal(page.url(), "https://mail.google.com/mail/u/0/");
    await page.close();
  });

  it("opens the link in a new tab only after Open", async () => {
    const page = await openGmail();
    await page.click("#plain");
    const popup = context.waitForEvent("page");
    await dialog(page).locator("[data-action=open]").click();
    const opened = await popup;
    assert.equal(opened.url(), "https://example.com/news");
    assert.equal(await dialog(page).count(), 0);
    await opened.close();
    await page.close();
  });

  it("closes on Escape and keeps keys away from the page", async () => {
    const page = await openGmail();
    await page.click("#plain");
    await dialog(page).waitFor();
    await page.keyboard.press("#");
    await page.keyboard.press("Escape");
    assert.equal(await dialog(page).count(), 0);
    assert.deepEqual(
      await page.evaluate(() => (window as unknown as { pageKeys: string[] }).pageKeys),
      [],
    );
    await page.close();
  });

  it("lets links outside the message body and mailto links through", async () => {
    const page = await openGmail();
    await page.click("#mailto");
    assert.equal(await dialog(page).count(), 0);
    await Promise.all([page.waitForURL("https://example.com/help"), page.click("#outside")]);
    await page.close();
  });

  it("unwraps the Google redirect", async () => {
    const page = await openGmail();
    await page.click("#wrapped");
    await dialog(page).waitFor();
    assert.equal(await dialog(page).locator(".url").textContent(), "https://evil.test/wrapped");
    await page.close();
  });

  it("adds the domain to the blocklist from the dialog, then blocks it", async () => {
    await setStorage({ blocklist: [] });
    const page = await openGmail();
    await page.click("#mismatch");
    await dialog(page).locator("input[type=text]").fill("phishing mail");
    await dialog(page).locator("[data-action=add-block]").click();
    await dialog(page).locator(".message").waitFor();
    assert.deepEqual(
      (await getBlocklist()).map((e) => [e.type, e.value, e.note]),
      [["domain", "evil.test", "phishing mail"]],
    );
    await page.keyboard.press("Escape");

    // The same destination is now blocked, also through the Google redirect, and
    // also outside the body: there is no Open button.
    await page.click("#wrapped");
    await dialog(page).locator(".message").waitFor();
    assert.equal(await dialog(page).locator("[data-action=open]").count(), 0);
    await page.close();
  });

  it("blocks a link outside the body when its destination is listed", async () => {
    await setStorage({
      blocklist: [
        {
          type: "url",
          value: "https://example.com/help",
          note: "",
          addedAt: "2026-10-18T00:00:00Z",
        },
      ],
    });
    const page = await openGmail();
    await page.click("#outside");
    await dialog(page).locator(".message").waitFor();
    assert.equal(page.url(), "https://mail.google.com/mail/u/0/");
    await page.close();
  });

  it("does nothing when turned off", async () => {
    await setStorage({ enabled: false });
    const page = await openGmail();
    await Promise.all([page.waitForURL("https://example.com/help"), page.click("#outside")]);
    await setStorage({ enabled: true });
    await page.close();
  });
});

describe("allowlist", () => {
  const allow = (host: string) => ({
    host,
    includeSubdomains: false,
    note: "",
    addedAt: "2026-10-18T00:00:00Z",
  });

  it("opens an allowlisted link without the dialog", async () => {
    await setStorage({ blocklist: [], allowlist: [allow("example.com")] });
    const page = await openGmail();
    await Promise.all([page.waitForURL("https://example.com/news"), page.click("#plain")]);
    assert.equal(await dialog(page).count(), 0);
    await page.close();
  });

  it("still asks when the link carries another URL, and blocks before allowing", async () => {
    await setStorage({
      allowlist: [allow("www.example.com"), allow("example.com")],
      blocklist: [
        {
          type: "url",
          value: "https://example.com/news",
          note: "",
          addedAt: "2026-10-18T00:00:00Z",
        },
      ],
    });
    const page = await openGmail();
    await page.click("#redirect");
    await dialog(page).waitFor();
    assert.equal(await dialog(page).locator(".message").count(), 0);
    await page.keyboard.press("Escape");
    await page.click("#plain");
    await dialog(page).locator(".message").waitFor();
    await page.close();
    await setStorage({ allowlist: [], blocklist: [] });
  });

  it("warns about shared-hosting sites and refuses them in the settings", async () => {
    const page = await openGmail();
    await page.click("#sites");
    await dialog(page).waitFor();
    const notes = await dialog(page).locator(".notes li").allTextContents();
    assert.ok(
      notes.some((n) => n.includes("sites.google.com")),
      notes.join(" / "),
    );
    await page.close();

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.fill("#allow-host", "sites.google.com");
    await options.click("#allow-form button[type=submit]");
    await options.locator("#allow-status .text-alert").waitFor();
    assert.deepEqual(await getStorage("allowlist"), []);
    await options.fill("#allow-host", "www.example.com");
    await options.click("#allow-form button[type=submit]");
    await options.waitForFunction(() => document.querySelectorAll("#allow-rows tr").length === 1);
    await options.close();
    await setStorage({ allowlist: [] });
  });
});

describe("no data leaves the device", () => {
  it("makes no request while checking, blocking and adding to the blocklist", async () => {
    await setStorage({ blocklist: [] });
    const page = await openGmail();
    requests.length = 0;
    await page.click("#mismatch");
    await dialog(page).locator("input[type=text]").fill("secret note");
    await dialog(page).locator("[data-action=add-block]").click();
    await dialog(page).locator(".message").waitFor();
    await page.keyboard.press("Escape");
    await page.click("#wrapped");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    assert.deepEqual(requests, []);
    await page.close();
  });

  it("ships no code that can make network requests", async () => {
    for (const file of ["content.js", "background.js", "options.js", "popup.js"]) {
      const code = await readFile(join(dist, file), "utf8");
      const found = code.match(
        /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|RTCPeerConnection)\b|new Image\b|chrome\.storage\.sync/g,
      );
      assert.equal(found, null, `${file}: ${found?.join(", ")}`);
    }
  });
});

describe("options page", () => {
  it("shows the version and open source links, and ships the license", async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    assert.match((await page.locator("#version").textContent()) ?? "", /0\.1\.0/);
    const hrefs = await page
      .locator("ul.links a")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    assert.ok(hrefs.includes("https://github.com/tysmmsy/mail-link-guard"));
    await page.goto(`chrome-extension://${extensionId}/LICENSE.txt`);
    assert.match((await page.textContent("body")) ?? "", /MIT License/);
    await page.close();
  });

  it("imports and exports the blocklist as JSON", async () => {
    await setStorage({ blocklist: [] });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const file = join(await mkdtemp(join(tmpdir(), "mlg-import-")), "list.json");
    await writeFile(
      file,
      JSON.stringify(["evil.test", "https://x.test/path", "localhost", "evil.test"]),
    );
    const chooser = page.waitForEvent("filechooser");
    await page.click("#import-button");
    await (await chooser).setFiles(file);
    await page.locator("#import-status .text-ok").waitFor();
    // The UI language follows the OS, so check the number rather than the wording.
    assert.match((await page.locator("#import-status").textContent()) ?? "", /2/);
    assert.equal(await page.locator("#block-rows tr").count(), 2);

    await page.click("#block-type");
    await page.click("[role=option][data-value=url]");
    await page.fill("#block-value", "https://bad.test/a#x");
    await page.click("#block-form button[type=submit]");
    await page.waitForFunction(() => document.querySelectorAll("#block-rows tr").length === 3);

    const download = page.waitForEvent("download");
    await page.click("#export-button");
    const exported = JSON.parse(await readFile((await (await download).path()) ?? "", "utf8"));
    assert.equal(exported.format, "mail-link-guard/blocklist");
    assert.deepEqual(
      exported.entries.map((e: { value: string }) => e.value),
      ["evil.test", "https://x.test/path", "https://bad.test/a"],
    );
    await page.close();
  });
});

// Runs last: it reloads the extension, which leaves the running page with a stale script.
describe("after the extension is reloaded", () => {
  it("holds body links without throwing until the page is reloaded", async () => {
    const page = await openGmail();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await worker.evaluate(() => chrome.runtime.reload());
    await page.waitForTimeout(1500);
    await page.click("#plain");
    await page.waitForTimeout(500);
    assert.equal(page.url(), "https://mail.google.com/mail/u/0/");
    assert.equal(await page.locator("[data-mail-link-guard-notice] [role=alert]").count(), 1);
    assert.deepEqual(
      errors.filter((e) => /context invalidated/i.test(e)),
      [],
    );
    await page.close();
  });
});
