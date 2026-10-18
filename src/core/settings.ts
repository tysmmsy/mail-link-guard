// Settings schema and chrome.storage.local access. Everything the extension keeps
// lives in this one object on the user's device; nothing is synced or sent anywhere.

import type { BlockEntry } from "./blocklist.ts";

export interface Settings {
  enabled: boolean;
  blocklist: BlockEntry[];
}

export function defaultSettings(): Settings {
  return {
    enabled: true,
    blocklist: [],
  };
}

/** Fills keys missing from older or partial stored data with defaults. */
export function withDefaults(stored: Partial<Settings>): Settings {
  const base = defaultSettings();
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : base.enabled,
    blocklist: Array.isArray(stored.blocklist) ? stored.blocklist : base.blocklist,
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(null)) as Partial<Settings>;
  return withDefaults(stored);
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

/** Calls `listener` when the user's settings or the organization's policy change. */
export function onSettingsChanged(listener: () => void): void {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local" || area === "managed") listener();
  });
}
