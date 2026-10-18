// Background service worker: writes default settings on install and opens the options
// page when the in-page dialog asks for it. It has no network access; the extension
// pages CSP sets connect-src 'none'.

import { defaultEntries, mergeEntries } from "../core/blocklist.ts";
import { t } from "../core/i18n.ts";
import { loadSettings, saveSettings } from "../core/settings.ts";

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const settings = await loadSettings();
  // Seed the default entries on first install only, so an entry the user removed
  // never comes back with an update.
  if (reason === "install") {
    const seeded = defaultEntries(new Date().toISOString(), (key) => t(key));
    settings.blocklist = mergeEntries(settings.blocklist, seeded).entries;
  }
  // Persist so every page reads the same complete settings object.
  await saveSettings(settings);
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if ((message as { type?: string } | null)?.type === "open-options") {
    void chrome.runtime.openOptionsPage();
  }
});
