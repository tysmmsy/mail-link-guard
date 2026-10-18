# 0001 Allowlist design

| Item | Value |
|---|---|
| Status | Accepted (2026-10-18) |
| Scope | The allowlist (`src/core/allowlist.ts`, the options page, the `enforcedAllowlist` and `allowUserAllowlist` policies) |
| Japanese | [0001-allowlist.ja.md](0001-allowlist.ja.md) |

This record explains why the allowlist exists and why it is restricted the way it is. A pull request that loosens a restriction or removes the allowlist must answer the reasoning here with a logical counter-argument (see "Changing this decision").

## Context

When every body link shows the dialog, people who open many links learn to press Open without reading. Research on habituation to security warnings shows the same: repeated warnings draw less attention. The allowlist lets the dialog be skipped for sites someone uses routinely.

The allowlist is also the riskiest setting in the extension. Three gaps were identified:

1. Trusted domains host pages anyone can publish. Allowing `google.com` would let a fake sign-in page on `sites.google.com` through. In October 2026 an attack was reported that re-sent a genuine Google notification and led to a fake page on Google Sites.
2. A redirect on a trusted domain can send an allowed URL to an attacker's site.
3. A legitimate site can be compromised, turning the allowed domain itself into the attack.

Keeping the allowlist at all was weighed too. It does nothing until someone adds a site, so it costs nothing for people who do not use it. It helps people who repeatedly open links from the same partners, internal systems or SaaS, and organizations whose administrators push their own domains. It does little for people whose links come from different senders every time. The decision was to keep it, with the restrictions below.

## Decision

| # | Decision | Guards against |
|---|---|---|
| D-1 | Sites are added only on the options page, never from the dialog | Allowing a site in the moment, while looking at a suspicious link |
| D-2 | The allowlist cannot be imported; organizations push it through policy | Allowing sites unknowingly through a file received from someone else |
| D-3 | Entries are host names only, not URLs, wildcards or regular expressions | Overly broad entries |
| D-4 | Hosts match exactly; subdomains only when the user chooses | Allowing subdomains unintentionally |
| D-5 | The blocklist always wins | Opening a destination that is both allowed and blocked |
| D-6 | Any note (text mismatch, Punycode, IP address, `@`, HTTP, shared host, shortener) shows the dialog | Links that disguise themselves |
| D-7 | Anything other than HTTPS on the default port shows the dialog | Unencrypted connections and unusual ports |
| D-8 | Any query (`?…`) or fragment (`#…`), or a path that holds a backslash, `:`, `@` or `//` (after decoding twice and dropping tab/CR/LF), shows the dialog whatever it holds; a site the URL appears to forward to is named in a note | Gap 2 (redirects) |
| D-9 | The check uses the destination after removing redirect wrappers (Google, Safe Links) | Wrappers used as disguise |
| D-10 | Users cannot add shared-hosting sites (`SHARED_HOSTING`) or URL shorteners, nor include subdomains that would cover one | Gap 1 (shared hosting) |
| D-11 | An organization's policy may allow its own tenant on a shared host (e.g. `contoso.sharepoint.com`) | Blocking legitimate organizational use |
| D-12 | An organization can turn off users' own allowlists through policy | Conflicts between organizational policy and personal settings |
| D-13 | At most 1,000 sites | An allowlist that effectively allows everything |

## Change log

- 2026-10-18: D-8 tightened. It used to look for another URL in query values; a security scan showed it missed query keys (`/out?https://evil.example`) and tab-split slashes (`/%09/evil.example`). Rather than closing spellings one by one, an allowlisted link now skips the dialog only when it has no query, no fragment, and no path character a redirector could read as an address. The dialog also names the site a link appears to forward to.

## Not covered

- An allowed site being compromised (gap 3). An allowlist cannot prevent it.
- Shared hosts missing from `SHARED_HOSTING`. The list is maintained by hand and can have gaps.

## Alternatives considered

| Alternative | Why it was not chosen |
|---|---|
| No allowlist | Habituation remains for people who open many links |
| Allow from the dialog | Per D-1, people allow sites exactly when an attacker is rushing them |
| Allow by exact URL | The same URL rarely arrives twice, so it would barely help |
| Organization policy only | People using the extension on their own would get no benefit; organizations can already turn off users' lists (D-12) |

## Possible future work

Not decided:

- Entries that expire after a set period
- Varying the dialog's appearance to reduce habituation

## Changing this decision

| Level | Meaning | When a condition gets this level | If a pull request does not meet it |
|---|---|---|---|
| MUST | Required before merge | Not meeting it would overturn this decision without grounds | Not merged |
| SHOULD | Expected, but a pull request can be merged without it | Not meeting it leaves reviewers without the facts they need | Explain why in the pull request |
| NICE TO HAVE | Helpful | Makes review faster | No action needed |

| # | Condition | Level |
|---|---|---|
| C-1 | A pull request that loosens or removes any of D-1 to D-13, or removes the allowlist, shows logically why what that item guards against is no longer a problem, or how it is guarded against another way | MUST |
| C-2 | Facts the argument in C-1 relies on (attack techniques, browser behavior) cite a source | MUST |
| C-3 | Unit or e2e tests cover the changed behavior | MUST |
| C-4 | This record is updated to match the new decision, in both English and Japanese | MUST |
| C-5 | Changes that tighten a restriction (such as adding to `SHARED_HOSTING`) need no counter-argument; give the reason in one line | SHOULD |
| C-6 | The pull request describes the effect on users (how the number of dialogs changes) | NICE TO HAVE |

> C-1 note: "It is inconvenient" is not a counter-argument by itself. Say which gap the change opens and how that gap is handled.
