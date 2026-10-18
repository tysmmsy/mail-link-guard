// Content script for Gmail: intercepts link clicks, then either blocks the link
// (blocklist hit) or asks the user to confirm the real destination (message body links).

import { allowedToSkip } from "../core/allowlist.ts";
import {
  type BlockEntry,
  type CompiledBlocklist,
  compileBlocklist,
  type EntryType,
  findBlock,
  makeEntry,
  mergeEntries,
} from "../core/blocklist.ts";
import { BODY_SELECTOR, isGmailHost } from "../core/gmail.ts";
import { analyzeLink, type LinkAnalysis } from "../core/link.ts";
import { type Effective, effectiveSettings, loadPolicy, type Policy } from "../core/policy.ts";
import { loadSettings, onSettingsChanged, saveSettings } from "../core/settings.ts";
import {
  closeDialog,
  handleDialogKey,
  isDialogEvent,
  showDialog,
  showReloadNotice,
} from "./dialog.ts";

start();

function start(): void {
  // about:blank and about:srcdoc frames inherit the origin of the page that created
  // them, so the origin, not location.hostname, tells whether this frame is Gmail.
  const pageHost = self.origin && self.origin !== "null" ? new URL(self.origin).hostname : "";
  if (!isGmailHost(pageHost)) return;

  let settings: Effective | null = null;
  let policy: Policy | null = null;
  // Compiled once per settings change, so a click only runs the tests.
  let blocked: CompiledBlocklist = () => null;

  // Resolves once the first settings and policy have loaded.
  let ready: Promise<void> = Promise.resolve();

  const refresh = async () => {
    const [own, managed] = await Promise.all([loadSettings(), loadPolicy()]);
    policy = managed;
    settings = effectiveSettings(own, managed);
    blocked = compileBlocklist(settings.blocklist);
    if (!settings.enabled) closeDialog();
  };

  const anchorFrom = (e: Event): HTMLAnchorElement | HTMLAreaElement | null => {
    for (const node of e.composedPath()) {
      if ((node instanceof HTMLAnchorElement || node instanceof HTMLAreaElement) && node.href) {
        return node;
      }
    }
    return null;
  };

  const addBlock = async (
    a: LinkAnalysis,
    type: EntryType,
    note: string,
  ): Promise<BlockEntry | null> => {
    const d = a.destination;
    const entry = makeEntry(type, type === "domain" ? d.hostname : d.href, note);
    if (!entry) return null;
    // Re-read so an edit made in the options page meanwhile is not overwritten.
    const latest = await loadSettings();
    const { entries } = mergeEntries(latest.blocklist, [entry]);
    await saveSettings({ blocklist: entries });
    return findBlock(entries, d);
  };

  const show = (analysis: LinkAnalysis, block: BlockEntry | null) => {
    showDialog(analysis, block, {
      open: () => {
        window.open(analysis.href, "_blank", "noopener,noreferrer");
      },
      addBlock:
        policy?.allowUserBlocklist === false
          ? null
          : (type, note) => addBlock(analysis, type, note),
      isEnforced: (entry) => settings?.isEnforced(entry) ?? false,
      openSettings: () => {
        chrome.runtime.sendMessage({ type: "open-options" }).catch(() => {});
      },
    });
  };

  // Check both the unwrapped destination and the raw href, so an entry for a wrapper
  // or a shortener also takes effect.
  const blockFor = (analysis: LinkAnalysis) =>
    blocked(analysis.destination) ?? blocked(new URL(analysis.href));

  const onLinkActivation = (e: MouseEvent) => {
    if (e.type === "click" && e.button !== 0) return;
    if (e.type === "auxclick" && e.button !== 1) return;
    if (!contextAlive()) {
      retire(e);
      return;
    }
    if (isDialogEvent(e) || settings?.enabled === false) return;

    const anchor = anchorFrom(e);
    if (!anchor) return;
    const text = anchor instanceof HTMLAnchorElement ? anchor.innerText : anchor.alt;
    const analysis = analyzeLink(anchor.href, text || anchor.textContent || "");
    if (!analysis) return;

    if (!settings) {
      // A click in the first moments after the page loads, before the blocklist is
      // read: hold it rather than let it through, and decide once the settings arrive.
      // The dialog never navigates by itself, so showing it a moment later is safe.
      e.preventDefault();
      e.stopImmediatePropagation();
      void ready.then(() => {
        if (settings?.enabled) show(analysis, blockFor(analysis));
      });
      return;
    }

    const block = blockFor(analysis);
    if (!block && !anchor.closest(BODY_SELECTOR)) return;
    // Allowlisted sites open without the dialog, but only when nothing about the link
    // is suspicious (see allowedToSkip). A blocklist hit has already taken precedence.
    if (!block && allowedToSkip(settings.allowlist, analysis)) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    show(analysis, block);
  };

  // After the extension is updated, reloaded or removed, a script already running in an
  // open tab loses access to chrome.* APIs ("Extension context invalidated"), and the new
  // version runs only once the tab is reloaded. Until then this copy holds links in the
  // message body with a notice to reload, rather than letting them through unchecked.
  const listen = (type: string, fn: EventListener) => window.addEventListener(type, fn, true);
  const contextAlive = (): boolean => {
    try {
      return Boolean(chrome.runtime?.id);
    } catch {
      return false;
    }
  };
  const retire = (e: MouseEvent) => {
    closeDialog();
    const anchor = anchorFrom(e);
    if (anchor?.closest(BODY_SELECTOR) && analyzeLink(anchor.href, "")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showReloadNotice();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (isDialogEvent(e)) handleDialogKey(e);
  };

  // Capture on window runs before any listener Gmail registers, so Gmail
  // never sees a click that is held for confirmation.
  listen("click", onLinkActivation as EventListener);
  listen("auxclick", onLinkActivation as EventListener);
  for (const type of ["keydown", "keypress", "keyup"]) {
    listen(type, onKey as EventListener);
  }
  // Text typed or pasted into the dialog also travels in these composed events
  // (beforeinput and composition events carry the characters). Stop them here so
  // Gmail's listeners never receive them; the browser still inserts the text.
  const shield = (e: Event) => {
    if (isDialogEvent(e)) e.stopImmediatePropagation();
  };
  for (const type of [
    "beforeinput",
    "input",
    "textInput",
    "compositionstart",
    "compositionupdate",
    "compositionend",
    "paste",
    "copy",
    "cut",
  ]) {
    listen(type, shield);
  }

  onSettingsChanged(() => void refresh());
  ready = refresh();
}
