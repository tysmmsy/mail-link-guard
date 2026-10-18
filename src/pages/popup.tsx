// Toolbar popup: on/off switch, whether the current tab is checked, and a button to
// open the settings. The active tab's URL is only readable on the one site the
// extension has access to; elsewhere it is undefined and the tab counts as not checked.

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { isGmailHost } from "../core/gmail.ts";
import { localizePage, t } from "../core/i18n.ts";
import { effectiveSettings } from "../core/policy.ts";
import { saveSettings } from "../core/settings.ts";
import { MacWindow } from "./components/mac.tsx";
import { usePolicy, useSettings } from "./use-settings.ts";

function useActiveTabHost(): string {
  const [host, setHost] = useState("");
  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      try {
        setHost(tab?.url ? new URL(tab.url).hostname : "");
      } catch {
        setHost("");
      }
    });
  }, []);
  return host;
}

function Popup() {
  const own = useSettings();
  const policy = usePolicy();
  const host = useActiveTabHost();
  if (!own || !policy) return null;
  const settings = effectiveSettings(own, policy);
  const locked = policy.enforcedEnabled !== undefined;
  const active = settings.enabled && isGmailHost(host);
  return (
    <MacWindow title={t("extName")} className="m-2 w-[284px]">
      <div className="mt-3 grid gap-2">
        <Label>
          <Checkbox
            id="enabled"
            checked={settings.enabled}
            disabled={locked}
            onCheckedChange={(v) => void saveSettings({ enabled: v === true })}
          />
          {t("popupEnabled")}
        </Label>
        <p id="status" className={active ? "text-[12px] text-ok" : "text-[12px]"}>
          {t(active ? "popupActive" : "popupInactive")}
        </p>
        <p id="count" className="text-[12px]">
          {t("popupBlockCount", settings.blocklist.length)}
        </p>
        <Button
          id="settings"
          variant="default"
          className="mt-2 w-full"
          onClick={() => {
            void chrome.runtime.openOptionsPage();
            window.close();
          }}
        >
          {t("popupOpenSettings")}
        </Button>
      </div>
    </MacWindow>
  );
}

localizePage();
const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
