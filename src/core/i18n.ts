// Typed wrapper around chrome.i18n so a misspelled message key fails type-checking,
// plus a helper that fills [data-i18n] elements on the extension pages.

import { locales, type MessageKey } from "../locales.ts";

export function t(key: MessageKey, ...subs: (string | number)[]): string {
  if (__E2E_LANG__) {
    // Screenshot builds only; release builds drop this branch and the locale table.
    const message = (locales[__E2E_LANG__] ?? locales.en)[key];
    return subs.reduce<string>((m, sub, i) => m.replaceAll(`$${i + 1}`, String(sub)), message);
  }
  return chrome.i18n.getMessage(key, subs.map(String)) || key;
}

/**
 * data-i18n="key" sets textContent, data-i18n-placeholder="key" sets the placeholder,
 * data-i18n-aria-label="key" sets aria-label.
 */
export function localizePage(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n as MessageKey);
  }
  for (const el of root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    el.placeholder = t(el.dataset.i18nPlaceholder as MessageKey);
  }
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-aria-label]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel as MessageKey));
  }
  document.documentElement.lang = chrome.i18n.getUILanguage();
}
