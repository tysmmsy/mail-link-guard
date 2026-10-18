// Captures the dialog and the options page at 1280x800, the size the Chrome Web Store
// asks for in listing screenshots. Uses the same fake Gmail page as the e2e test.
// Run `pnpm build` first. Output goes to release/screenshots/.

import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const dist = join(root, "dist");
const out = join(root, "release/screenshots");
const fixture = await readFile(join(root, "e2e/fixtures/gmail.html"), "utf8");

await mkdir(out, { recursive: true });
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "mlg-shot-")), {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (!url.protocol.startsWith("http")) return route.continue();
  return route.fulfill({ contentType: "text/html", body: fixture });
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const id = new URL(worker.url()).host;
// Wait for the install handler to seed the defaults, or it would overwrite the list below.
await worker.evaluate(async () => {
  for (let i = 0; i < 50 && !(await chrome.storage.local.get("blocklist")).blocklist; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
});
await worker.evaluate(() =>
  chrome.storage.local.set({
    blocklist: [
      {
        type: "domain",
        value: "evil.test",
        note: "Fake parcel notice",
        addedAt: "2026-10-01T00:00:00Z",
      },
      {
        type: "url",
        value: "https://cdn.example.com/phish/",
        note: "",
        addedAt: "2026-10-12T00:00:00Z",
      },
    ],
  }),
);

const page = await context.newPage();
await page.goto("https://mail.google.com/mail/u/0/");
await page.waitForTimeout(300);
await page.click("#mismatch");
await page.locator("[data-mail-link-guard] .dialog").waitFor();
await page.screenshot({ path: join(out, `blocked.png`) });
await page.keyboard.press("Escape");

await worker.evaluate(() => chrome.storage.local.set({ blocklist: [] }));
await page.click("#mismatch");
await page.screenshot({ path: join(out, `confirm.png`) });

const options = await context.newPage();
await worker.evaluate(() =>
  chrome.storage.local.set({
    blocklist: [
      {
        type: "domain",
        value: "evil.test",
        note: "Fake parcel notice",
        addedAt: "2026-10-01T00:00:00Z",
      },
      {
        type: "url",
        value: "https://cdn.example.com/phish/",
        note: "",
        addedAt: "2026-10-12T00:00:00Z",
      },
    ],
  }),
);
await options.goto(`chrome-extension://${id}/options.html`);
await options.waitForTimeout(200);
await options.screenshot({ path: join(out, `options.png`) });

const popup = await context.newPage();
await popup.setViewportSize({ width: 320, height: 220 });
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForTimeout(200);
await popup.screenshot({ path: join(out, `popup.png`) });

// Small promotional tile (440x280), required by the store listing.
const tile = await context.newPage();
await tile.setViewportSize({ width: 440, height: 280 });
const icon = (await readFile(join(root, "static/icons/icon128.png"))).toString("base64");
await tile.setContent(
  `<!doctype html><html><head><style>
    html, body { margin: 0; width: 440px; height: 280px; overflow: hidden; }
    body { display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; background: #dddddd; color: #000; font: bold 28px "Charcoal", "Chicago", system-ui, sans-serif; }
  </style></head><body><img src="data:image/png;base64,${icon}" width="128" height="128" alt="">
  <div>Mail Link Guard</div></body></html>`,
);
await tile.screenshot({ path: join(out, "promo-small-440x280.png") });

await context.close();
console.log(`wrote screenshots to ${out}`);
