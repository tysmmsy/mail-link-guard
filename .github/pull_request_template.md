<!-- Pull request template: keeps the privacy and permission review explicit for every change. See CONTRIBUTING.md. -->

## What changed

## Why

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:e2e` pass
- [ ] No new network access (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, remote scripts)
- [ ] No new permissions or match patterns in `static/manifest.json`, or the agreed issue is linked above
- [ ] Does not go against a decision in `docs/decisions/`, or the record's "Changing this decision" conditions are met above
- [ ] Nothing new is stored, or the storage tables in `README.md`, `README.ja.md` and `PRIVACY.md` are updated
- [ ] `README.md`, `README.ja.md` and `PRIVACY.md` still describe the behavior correctly
