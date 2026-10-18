// Settings an organization pushes through Chrome policy (Google Admin console, Windows
// Group Policy, macOS configuration profiles). Chrome delivers them locally into
// chrome.storage.managed, read-only for the extension and the user; nothing is fetched.
// The schema is static/managed_schema.json.

import { type AllowEntry, makeAllowEntry } from "./allowlist.ts";
import { type BlockEntry, ENTRY_TYPES, type EntryType, makeEntry } from "./blocklist.ts";
import type { Settings } from "./settings.ts";

export interface Policy {
  /** true or false locks the on/off switch to that value; undefined leaves it to the user. */
  enforcedEnabled?: boolean;
  /** Entries applied for everyone, which users cannot remove. */
  enforcedBlocklist: BlockEntry[];
  /** false hides the user's own entries and stops them from adding or importing. */
  allowUserBlocklist: boolean;
  /** Sites allowed for everyone; shared-hosting checks do not apply to these. */
  enforcedAllowlist: AllowEntry[];
  /** false ignores the user's own allowlist and stops them from adding to it. */
  allowUserAllowlist: boolean;
}

export const NO_POLICY: Policy = {
  enforcedBlocklist: [],
  allowUserBlocklist: true,
  enforcedAllowlist: [],
  allowUserAllowlist: true,
};

/** Turns raw managed storage into a Policy, dropping anything malformed. */
export function normalizePolicy(raw: Record<string, unknown>): Policy {
  const items = Array.isArray(raw.enforcedBlocklist) ? raw.enforcedBlocklist : [];
  const enforcedBlocklist = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    if (!ENTRY_TYPES.includes(o.type as EntryType) || typeof o.value !== "string") return [];
    const note = typeof o.note === "string" ? o.note : "";
    const entry = makeEntry(o.type as EntryType, o.value, note, "");
    return entry ? [entry] : [];
  });
  const allowItems = Array.isArray(raw.enforcedAllowlist) ? raw.enforcedAllowlist : [];
  const enforcedAllowlist = allowItems.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    if (typeof o.host !== "string") return [];
    const note = typeof o.note === "string" ? o.note : "";
    const r = makeAllowEntry(o.host, o.includeSubdomains === true, note, "", { enforced: true });
    return "entry" in r ? [r.entry] : [];
  });
  return {
    enforcedEnabled: typeof raw.enforcedEnabled === "boolean" ? raw.enforcedEnabled : undefined,
    enforcedBlocklist,
    allowUserBlocklist: raw.allowUserBlocklist !== false,
    enforcedAllowlist,
    allowUserAllowlist: raw.allowUserAllowlist !== false,
  };
}

export async function loadPolicy(): Promise<Policy> {
  try {
    return normalizePolicy((await chrome.storage.managed.get(null)) as Record<string, unknown>);
  } catch {
    // No schema or no policy support (for example an unmanaged browser): no policy.
    return NO_POLICY;
  }
}

/** The settings that actually apply once the policy is laid over the user's own. */
export interface Effective {
  enabled: boolean;
  /** Enforced entries first, so a block shows the organization's rule when both match. */
  blocklist: BlockEntry[];
  /** Consulted only after the blocklist: a blocked destination is never let through. */
  allowlist: AllowEntry[];
  isEnforced(entry: BlockEntry): boolean;
}

export function effectiveSettings(settings: Settings, policy: Policy): Effective {
  const enforced = new Set(policy.enforcedBlocklist);
  return {
    enabled: policy.enforcedEnabled ?? settings.enabled,
    blocklist: [
      ...policy.enforcedBlocklist,
      ...(policy.allowUserBlocklist ? settings.blocklist : []),
    ],
    allowlist: [
      ...policy.enforcedAllowlist,
      ...(policy.allowUserAllowlist ? (settings.allowlist ?? []) : []),
    ],
    isEnforced: (entry) => enforced.has(entry),
  };
}
