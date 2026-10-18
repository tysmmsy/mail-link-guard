# Contributing

This document sets the rules a pull request has to meet and explains how to add a translation. The center of it is privacy and speed (C-2 to C-5): the extension runs next to people's mail, so it must never send data anywhere, must store as little as possible, and must not slow the mail page down.

Issues and pull requests are welcome. If a rule below gets in the way of a good change, say so in the issue with your reasoning.

## Priority levels

| Level | Meaning | When a rule gets this level | If a pull request does not meet it |
|---|---|---|---|
| MUST | Required before merge | Not meeting it would leak data, break the extension, or break the license | Not merged |
| SHOULD | Expected, but a pull request can be merged without it | Not meeting it makes the code harder to maintain or review | Explain why in the pull request |
| NICE TO HAVE | Helpful | Makes review easier, with no effect on users | No action needed |

## Rules for pull requests

| # | Rule | Level |
|---|---|---|
| C-1 | `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` pass | MUST |
| C-2 | No code that can make a network request is added: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, remote scripts, styles, fonts or images, or `chrome.storage.sync` | MUST |
| C-3 | No new permission or match pattern is added to `static/manifest.json` without an issue that agreed on it first | MUST |
| C-4 | Nothing new is stored. If a stored item is truly needed, the storage tables in `README.md`, `README.ja.md` and `PRIVACY.md` are updated in the same pull request | MUST |
| C-5 | `src/content/` and `src/background/` stay free of third-party runtime packages and stay unminified | MUST |
| C-6 | All code is contributed under the MIT License, and no dependency with a license that conflicts with it (such as GPL) is added | MUST |
| C-7 | A change in behavior comes with a unit or e2e test | SHOULD |
| C-8 | UI changes keep the classic Mac OS look (gray windows, beveled controls, no animations) | SHOULD |
| C-9 | A pull request that changes the UI includes a screenshot (`pnpm screenshots`) | NICE TO HAVE |

> C-2 reason: "no data leaves the device" is the main promise of the extension. The e2e test checks that no request is made during checking, blocking and adding entries, and that the bundles contain none of the APIs above.

> C-4 note: today only `enabled` and `blocklist` are stored. Data needed only while a dialog is open stays in memory.

> C-5 reason: the content script is loaded on every visit to the mail page. Keeping it small and dependency-free keeps that load fast, and keeping it unminified lets anyone read exactly what runs next to their mail. The settings page and popup may use React and shadcn/ui.

## Adding a translation

The interface follows Chrome's display language through `chrome.i18n`. All strings live in `src/locales.ts`.

1. Add an object for the language, typed as `Record<MessageKey, string>`, next to `en` and `ja`. The compiler reports any missing key.
2. Register it in the `locales` map under Chrome's locale code, such as `de`, `fr`, `ko`, `pt_BR` or `zh_CN`.
3. Keep `$1` and `$2` where the English string has them; they are replaced with numbers or names.
4. Run `pnpm build` and check the result with Chrome set to that language.

A translation needs no other code change. `pnpm build` writes `dist/_locales/<code>/messages.json` from the object.

## Development setup

See "Development" in [README.md](README.md).
