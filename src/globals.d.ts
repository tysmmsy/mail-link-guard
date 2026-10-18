// Build-time constant set by scripts/build.ts. True only for the e2e and screenshot
// builds, which need an inspectable dialog; release builds are always false.
declare const __E2E__: boolean;

/** E2E builds only: a locale code that overrides Chrome's UI language, or "". */
declare const __E2E_LANG__: string;
