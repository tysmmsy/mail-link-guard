// React hooks that mirror chrome.storage.local and chrome.storage.managed, so the page
// re-renders when the in-page dialog, another extension page, or the organization's
// policy changes the settings.

import { useEffect, useState } from "react";
import { loadPolicy, type Policy } from "../core/policy.ts";
import { loadSettings, onSettingsChanged, type Settings } from "../core/settings.ts";

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void loadSettings().then((s) => {
        if (alive) setSettings(s);
      });
    };
    reload();
    onSettingsChanged(reload);
    return () => {
      alive = false;
    };
  }, []);
  return settings;
}

/** The organization's policy from chrome.storage.managed, kept current. */
export function usePolicy(): Policy | null {
  const [policy, setPolicy] = useState<Policy | null>(null);
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void loadPolicy().then((p) => {
        if (alive) setPolicy(p);
      });
    };
    reload();
    onSettingsChanged(reload);
    return () => {
      alive = false;
    };
  }, []);
  return policy;
}
