// The confirmation dialog shown over the webmail page. It lives in a shadow root so
// the page's CSS cannot restyle it and its CSS cannot leak into the page.

import type { BlockEntry, EntryType } from "../core/blocklist.ts";
import { t } from "../core/i18n.ts";
import type { LinkAnalysis, NoteKind } from "../core/link.ts";

export interface DialogHandlers {
  open(): void;
  /** null when the organization does not allow users to add entries. */
  addBlock: ((type: EntryType, note: string) => Promise<BlockEntry | null>) | null;
  /** Whether an entry comes from the organization's policy. */
  isEnforced(entry: BlockEntry): boolean;
  openSettings(): void;
}

const HOST_ATTR = "data-mail-link-guard";

// Classic Mac OS "Platinum" look, matching src/pages/globals.css. One light theme and
// no transitions, so the dialog appears in the same frame as the click.
const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.backdrop {
  position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center;
  justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.25);
  font: 16px/1.5 "Osaka", "Charcoal", "Chicago", "Hiragino Sans", "Hiragino Kaku Gothic ProN",
    "Meiryo", system-ui, sans-serif;
  color: #000;
}
.dialog {
  width: min(640px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #ddd;
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 #fff, inset -1px -1px 0 #999, 2px 2px 0 rgba(0, 0, 0, 0.35);
}
h2 {
  margin: 0; height: 28px; display: flex; align-items: center; justify-content: center;
  border-bottom: 1px solid #000; padding: 5px 4px; background-color: #ddd;
  background-image: repeating-linear-gradient(to bottom, #eee 0 1px, #999 1px 2px);
  background-clip: content-box;
}
h2 span { background: #ddd; padding: 0 8px; font-size: 16px; line-height: 16px; font-weight: bold; }
.blocked h2 span { color: #c00; }
.content { padding: 12px 16px 16px; }
dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; }
dt { color: #333; }
dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.host { font-size: 19px; font-weight: bold; }
.ascii { font: 14px "Monaco", "Osaka-Mono", ui-monospace, Menlo, monospace; color: #333; }
.url {
  font: 14px/1.4 "Monaco", "Osaka-Mono", ui-monospace, Menlo, monospace; background: #fff;
  border: 1px solid #000; box-shadow: -1px -1px 0 #999, 1px 1px 0 #fff; padding: 3px 5px;
  max-height: 6em; overflow: auto;
}
.info { margin: 10px 0 0; font-size: 14px; color: #333; }
.notes {
  margin: 10px 0 0; padding: 6px 10px 6px 26px; background: #ffc; border: 1px solid #000;
  font-size: 14px;
}
.notes li + li { margin-top: 2px; }
.message { margin: 10px 0 0; padding: 6px 10px; background: #fff; border: 2px solid #c00; }
.panel {
  margin: 12px 0 0; min-width: 0; padding: 4px 10px 10px; border: 1px solid #999;
  box-shadow: 1px 1px 0 #fff, inset 1px 1px 0 #fff; display: grid; gap: 6px;
}
.panel legend { padding: 0 4px; font-weight: bold; }
.panel .help { margin: 0 0 2px; font-size: 14px; }
.panel label { display: flex; gap: 8px; align-items: center; overflow-wrap: anywhere; }
.panel .note-label, .panel .row button { flex: none; }
.panel input[type="radio"] { margin: 0; accent-color: #000; }
.panel input[type="text"] {
  font: inherit; color: #000; background: #fff; width: 100%; height: 28px; padding: 0 6px;
  border: 1px solid #000; box-shadow: -1px -1px 0 #999, 1px 1px 0 #fff; border-radius: 0;
}
.panel .row { display: flex; gap: 10px; align-items: center; }
.error { color: #c00; font-size: 14px; margin: 0; }
.error:empty { display: none; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 16px; }
.actions .spacer { flex: 1; }
button {
  font: inherit; font-size: 16px; min-width: 96px; height: 28px; padding: 0 14px; color: #000;
  border: 1px solid #000; border-radius: 5px; cursor: default; white-space: nowrap;
  background-image: linear-gradient(#fff, #ddd);
  box-shadow: inset 1px 1px 0 #fff, inset -1px -1px 0 #999;
}
/* Hover: the lavender tint Platinum used for highlighted controls. Instant, no transition. */
button:hover:not(:disabled) { background-image: linear-gradient(#fff, #ccccee); }
.panel label:hover { color: #333399; }
button:active { background: #777; color: #fff; box-shadow: inset 1px 1px 0 #000; }
button.primary {
  box-shadow: inset 1px 1px 0 #fff, inset -1px -1px 0 #999, 0 0 0 2px #ddd, 0 0 0 4px #000;
  margin: 0 4px;
}
button.danger { color: #c00; font-weight: bold; }
button:focus-visible, input:focus-visible { outline: 2px solid #66c; outline-offset: 1px; }
`;

type Child = Node | string | null | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function noteText(kind: NoteKind, a: LinkAnalysis): string {
  switch (kind) {
    case "text-mismatch":
      return t("noteTextMismatch", a.textHost ?? "");
    case "insecure":
      return t("noteInsecure");
    case "ip-host":
      return t("noteIpHost");
    case "punycode":
      return t("notePunycode");
    case "shortener":
      return t("noteShortener");
    case "shared-host":
      return t("noteSharedHost", a.destination.hostname);
    case "credentials":
      return t("noteCredentials", safeDecode(a.destination.username));
  }
}

let current: { host: HTMLElement; root: ShadowRoot; close(): void } | null = null;

export function isDialogEvent(e: Event): boolean {
  return !!current && e.composedPath().includes(current.host);
}

/**
 * Keyboard events inside the dialog are consumed here (called from a window capture
 * listener) so that webmail shortcuts such as Gmail's "#" (delete) never see them.
 * Typing still works because stopping propagation does not cancel the default action.
 */
export function handleDialogKey(e: KeyboardEvent): void {
  if (!current) return;
  e.stopImmediatePropagation();
  if (e.type !== "keydown") return;
  if (e.key === "Escape") {
    e.preventDefault();
    current.close();
    return;
  }
  if (e.key === "Tab") {
    const focusables = [
      ...current.root.querySelectorAll<HTMLElement>("button, input:not([disabled])"),
    ].filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const idx = focusables.indexOf(current.root.activeElement as HTMLElement);
    const next = e.shiftKey
      ? (idx <= 0 ? focusables.length : idx) - 1
      : (idx + 1) % focusables.length;
    e.preventDefault();
    focusables[next].focus();
  }
}

export function closeDialog(): void {
  current?.close();
}

export function showDialog(
  analysis: LinkAnalysis,
  initialBlock: BlockEntry | null,
  handlers: DialogHandlers,
): void {
  closeDialog();
  const previousFocus = document.activeElement as HTMLElement | null;
  const host = document.createElement("div");
  // A closed shadow root keeps Gmail's own scripts from reading what the dialog shows
  // or what is typed into it. Only the e2e build opens it, so tests can inspect it.
  if (__E2E__) host.setAttribute(HOST_ATTR, "");
  const root = host.attachShadow({ mode: __E2E__ ? "open" : "closed" });
  const close = () => {
    host.remove();
    if (current?.host === host) current = null;
    previousFocus?.focus?.({ preventScroll: true });
  };
  current = { host, root, close };

  const render = (block: BlockEntry | null) => {
    root.replaceChildren(h("style", {}, STYLE), build(block));
    const focusTarget = root.querySelector<HTMLElement>("[data-autofocus]");
    focusTarget?.focus({ preventScroll: true });
  };

  const build = (block: BlockEntry | null): HTMLElement => {
    const d = analysis.destination;
    const titleId = "mlg-title";
    const details = h(
      "dl",
      {},
      h("dt", {}, t("labelText")),
      h("dd", {}, analysis.text || "-"),
      h("dt", {}, t("labelHost")),
      h(
        "dd",
        {},
        h("span", { class: "host" }, analysis.unicodeHost),
        analysis.unicodeHost !== d.hostname && h("span", { class: "ascii" }, ` (${d.hostname})`),
      ),
      h("dt", {}, t("labelUrl")),
      h("dd", { class: "url" }, d.href),
      block && h("dt", {}, t("labelEntry")),
      block && h("dd", {}, block.note ? `${block.value} (${block.note})` : block.value),
    );
    const wrapperInfo =
      analysis.wrapper &&
      h(
        "p",
        { class: "info" },
        t(analysis.wrapper === "google-redirect" ? "wrapperGoogle" : "wrapperSafelinks"),
      );
    const actions = h("div", { class: "actions" });
    const content = h("div", { class: "content" }, details, wrapperInfo);
    const dialog = h(
      "div",
      {
        class: block ? "dialog blocked" : "dialog",
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
      },
      h("h2", { id: titleId }, h("span", {}, t(block ? "dialogBlockedTitle" : "dialogTitle"))),
      content,
    );

    if (block) {
      content.append(
        h(
          "p",
          { class: "message" },
          t(handlers.isEnforced(block) ? "dialogEnforcedBody" : "dialogBlockedBody"),
        ),
      );
      const settings = h("button", { type: "button", "data-action": "settings" }, t("btnSettings"));
      settings.addEventListener("click", () => {
        handlers.openSettings();
        close();
      });
      const closeBtn = h(
        "button",
        { type: "button", "data-action": "close", "data-autofocus": "" },
        t("btnClose"),
      );
      closeBtn.addEventListener("click", close);
      actions.append(settings, h("span", { class: "spacer" }), closeBtn);
    } else {
      content.append(
        analysis.notes.length > 0
          ? h(
              "ul",
              { class: "notes" },
              ...analysis.notes.map((n) => h("li", {}, noteText(n, analysis))),
            )
          : h("p", { class: "info" }, t("noteNone")),
      );
      const cancel = h(
        "button",
        { type: "button", "data-action": "cancel", "data-autofocus": "" },
        t("btnCancel"),
      );
      cancel.addEventListener("click", close);
      const open = h(
        "button",
        { type: "button", class: "primary", "data-action": "open" },
        t("btnOpen"),
      );
      open.addEventListener("click", () => {
        close();
        handlers.open();
      });
      // The registration controls are always visible, so blocking takes one button
      // ("Block") rather than a button that opens another button.
      if (handlers.addBlock) content.append(buildBlockPanel(render));
      actions.append(h("span", { class: "spacer" }), cancel, open);
    }
    content.append(actions);

    const backdrop = h("div", { class: "backdrop" }, dialog);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    return backdrop;
  };

  const buildBlockPanel = (rerender: (b: BlockEntry | null) => void): HTMLElement => {
    const d = analysis.destination;
    const domainRadio = h("input", { type: "radio", name: "scope", value: "domain", checked: "" });
    const urlRadio = h("input", { type: "radio", name: "scope", value: "url" });
    const note = h("input", {
      type: "text",
      id: "mlg-note",
      placeholder: t("notePlaceholder"),
      maxlength: "200",
    });
    const error = h("p", { class: "error", role: "status" });
    const add = h(
      "button",
      { type: "button", class: "danger", "data-action": "add-block" },
      t("btnRegister"),
    );
    add.addEventListener("click", async () => {
      add.disabled = true;
      const entry = await handlers
        .addBlock?.(urlRadio.checked ? "url" : "domain", note.value)
        .catch(() => null);
      if (entry) {
        rerender(entry);
      } else {
        error.textContent = t("blockAddFailed");
        add.disabled = false;
      }
    });
    return h(
      "fieldset",
      { class: "panel" },
      h("legend", {}, t("blockPanelTitle")),
      h("p", { class: "help" }, t("blockPanelHelp")),
      h("label", {}, domainRadio, t("blockScopeDomain", d.hostname)),
      h("label", {}, urlRadio, t("blockScopeUrl")),
      h(
        "div",
        { class: "row" },
        h("label", { for: "mlg-note", class: "note-label" }, t("noteLabel")),
        note,
        add,
      ),
      error,
    );
  };

  render(initialBlock);
  (document.body ?? document.documentElement).append(host);
  root.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
}

/**
 * Shown when this copy of the content script has outlived the extension (it was updated
 * or reloaded). chrome.i18n is no longer reachable, so the text is built in.
 */
export function showReloadNotice(): void {
  const ja = navigator.language.toLowerCase().startsWith("ja");
  const text = ja
    ? "Mail Link Guardが更新されました。リンクを確認するには、このページを再読み込みしてください。"
    : "Mail Link Guard was updated. Reload this page to check links again.";
  const host = document.createElement("div");
  if (__E2E__) host.setAttribute("data-mail-link-guard-notice", "");
  const root = host.attachShadow({ mode: __E2E__ ? "open" : "closed" });
  const box = document.createElement("div");
  box.setAttribute("role", "alert");
  box.textContent = text;
  const style = document.createElement("style");
  style.textContent = `div { position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    z-index: 2147483647; max-width: 560px; padding: 10px 16px; background: #ffc; color: #000;
    border: 1px solid #000; box-shadow: 2px 2px 0 rgba(0,0,0,.35);
    font: 16px/1.5 "Osaka", "Hiragino Sans", "Meiryo", system-ui, sans-serif; }`;
  root.append(style, box);
  (document.body ?? document.documentElement).append(host);
  setTimeout(() => host.remove(), 8000);
}
