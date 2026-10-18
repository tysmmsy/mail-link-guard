// Options page: the on/off switch and the blocklist (add, filter, remove, JSON import
// and export). Every change is written to chrome.storage.local at once; the page
// re-renders from storage, so entries added from the in-page dialog appear here too.

import { type FormEvent, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AllowEntry,
  type AllowError,
  allowKey,
  MAX_ALLOW_ENTRIES,
  makeAllowEntry,
} from "../core/allowlist.ts";
import {
  type BlockEntry,
  ENTRY_TYPES,
  type EntryType,
  entryKey,
  ImportError,
  MAX_ENTRIES,
  makeEntry,
  mergeEntries,
  parseImport,
  removeEntry,
  toExportJson,
} from "../core/blocklist.ts";
import { localizePage, t } from "../core/i18n.ts";
import { loadSettings, saveSettings } from "../core/settings.ts";
import type { MessageKey } from "../locales.ts";
import { Group, MacWindow, Status } from "./components/mac.tsx";
import { usePolicy, useSettings } from "./use-settings.ts";

const REPOSITORY = "https://github.com/tysmmsy/mail-link-guard";

type StatusState = { message: string; kind: "ok" | "error" | "" };
const clear: StatusState = { message: "", kind: "" };

const importErrorMessages: Record<string, MessageKey> = {
  "not-json": "optImportNotJson",
  "wrong-format": "optImportWrongFormat",
  "newer-version": "optImportNewer",
  "too-large": "optImportTooLarge",
  "too-many": "optTooMany",
};

const typeLabels: Record<EntryType, MessageKey> = {
  domain: "optTypeDomain",
  url: "optTypeUrl",
  wildcard: "optTypeWildcard",
  regex: "optTypeRegex",
};

const placeholders: Record<EntryType, MessageKey> = {
  domain: "optValuePlaceholder",
  url: "optValuePlaceholder",
  wildcard: "optWildcardPlaceholder",
  regex: "optRegexPlaceholder",
};

const dateFormat = new Intl.DateTimeFormat(chrome.i18n.getUILanguage(), { dateStyle: "medium" });

function formatDate(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : dateFormat.format(ms);
}

function EntriesTable({
  id,
  entries,
  onRemove,
}: {
  id: string;
  entries: BlockEntry[];
  /** Omitted for entries the user cannot change. */
  onRemove?: (entry: BlockEntry) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[96px]">{t("optColType")}</TableHead>
          <TableHead>{t("optColValue")}</TableHead>
          <TableHead>{t("optColNote")}</TableHead>
          <TableHead className="w-[96px]">{t("optColAdded")}</TableHead>
          <TableHead className="w-[72px]" />
        </TableRow>
      </TableHeader>
      <TableBody id={id}>
        {entries.map((entry) => (
          <TableRow key={entryKey(entry)}>
            <TableCell className="whitespace-nowrap">{t(typeLabels[entry.type])}</TableCell>
            <TableCell className="font-mono break-all">{entry.value}</TableCell>
            <TableCell className="break-words">{entry.note}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(entry.addedAt)}</TableCell>
            <TableCell className="text-right">
              {onRemove && (
                <Button size="sm" variant="destructive" onClick={() => onRemove(entry)}>
                  {t("btnRemove")}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AllowTable({
  id,
  entries,
  onRemove,
}: {
  id: string;
  entries: AllowEntry[];
  onRemove?: (entry: AllowEntry) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("optColValue")}</TableHead>
          <TableHead className="w-[160px]">{t("optColScope")}</TableHead>
          <TableHead>{t("optColNote")}</TableHead>
          <TableHead className="w-[96px]">{t("optColAdded")}</TableHead>
          <TableHead className="w-[88px]" />
        </TableRow>
      </TableHeader>
      <TableBody id={id}>
        {entries.map((entry) => (
          <TableRow key={allowKey(entry)}>
            <TableCell className="font-mono break-all">{entry.host}</TableCell>
            <TableCell className="whitespace-nowrap">
              {t(entry.includeSubdomains ? "scopeSubdomains" : "scopeExact")}
            </TableCell>
            <TableCell className="break-words">{entry.note}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(entry.addedAt)}</TableCell>
            <TableCell className="text-right">
              {onRemove && (
                <Button size="sm" variant="destructive" onClick={() => onRemove(entry)}>
                  {t("btnRemove")}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ManagedGroup({
  blocklist,
  allowlist,
}: {
  blocklist: BlockEntry[];
  allowlist: AllowEntry[];
}) {
  return (
    <Group title={t("optManaged")}>
      <p className="mb-2 text-[14px]">{t("optManagedHelp")}</p>
      {blocklist.length > 0 && <EntriesTable id="managed-rows" entries={blocklist} />}
      {allowlist.length > 0 && (
        <>
          <h3 className="mt-3 mb-1 text-[14px] font-bold">{t("optManagedAllowlist")}</h3>
          <AllowTable id="managed-allow-rows" entries={allowlist} />
        </>
      )}
    </Group>
  );
}

const allowErrors: Record<AllowError, MessageKey> = {
  invalid: "optAllowInvalid",
  "shared-host": "optAllowShared",
  "shared-parent": "optAllowSharedParent",
};

/**
 * The allowlist can be edited only here, never from the in-page dialog: allowing a site
 * should be a deliberate choice, not a click made while looking at a suspicious link.
 */
function AllowlistGroup({ entries, allowed }: { entries: AllowEntry[]; allowed: boolean }) {
  const [host, setHost] = useState("");
  const [subdomains, setSubdomains] = useState(false);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<StatusState>(clear);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const r = makeAllowEntry(host, subdomains, note, new Date().toISOString());
    if ("error" in r) {
      setStatus({ message: t(allowErrors[r.error], r.detail ?? ""), kind: "error" });
      return;
    }
    const latest = await loadSettings();
    if (latest.allowlist.some((x) => allowKey(x) === allowKey(r.entry))) {
      setStatus({ message: t("optDuplicate"), kind: "error" });
      return;
    }
    if (latest.allowlist.length >= MAX_ALLOW_ENTRIES) {
      setStatus({ message: t("optTooMany", MAX_ALLOW_ENTRIES), kind: "error" });
      return;
    }
    await saveSettings({ allowlist: [...latest.allowlist, r.entry] });
    setHost("");
    setNote("");
    setSubdomains(false);
    setStatus(clear);
  };

  const remove = async (entry: AllowEntry) => {
    const latest = await loadSettings();
    await saveSettings({
      allowlist: latest.allowlist.filter((x) => allowKey(x) !== allowKey(entry)),
    });
  };

  return (
    <Group title={t("optAllowlist")}>
      <p className="mb-2 text-[14px]">{t("optAllowlistHelp")}</p>
      {!allowed && (
        <p id="user-allowlist-disabled" className="mb-2 text-[14px] text-alert">
          {t("optAllowUserDisabled")}
        </p>
      )}
      <fieldset disabled={!allowed} className="contents">
        <form id="allow-form" onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input
            id="allow-host"
            className="w-auto flex-[3_1_220px]"
            placeholder={t("optHostPlaceholder")}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            autoComplete="off"
          />
          <Input
            id="allow-note"
            className="w-auto flex-[1_1_140px]"
            placeholder={t("optNotePlaceholder")}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoComplete="off"
          />
          <Button type="submit" variant="default">
            {t("btnAdd")}
          </Button>
          <Label className="basis-full">
            <Checkbox
              id="allow-subdomains"
              checked={subdomains}
              onCheckedChange={(v) => setSubdomains(v === true)}
            />
            {t("optIncludeSubdomains")}
          </Label>
        </form>
      </fieldset>
      <div id="allow-status">
        <Status {...status} />
      </div>
      <AllowTable
        id="allow-rows"
        entries={[...entries].reverse()}
        onRemove={allowed ? (entry) => void remove(entry) : undefined}
      />
      {entries.length === 0 && <p className="mt-2 text-[14px]">{t("optAllowlistEmpty")}</p>}
    </Group>
  );
}

function BlocklistGroup({ entries, allowed }: { entries: BlockEntry[]; allowed: boolean }) {
  const [type, setType] = useState<EntryType>("domain");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<StatusState>(clear);
  const valueRef = useRef<HTMLInputElement>(null);

  // Newest first: the entry just added from the dialog is the one people look for.
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f
      ? entries.filter((e) => e.value.toLowerCase().includes(f) || e.note.toLowerCase().includes(f))
      : entries;
    return [...list].reverse();
  }, [entries, filter]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const entry = makeEntry(type, value, note);
    if (!entry) {
      setStatus({ message: t("optValueInvalid"), kind: "error" });
      return;
    }
    const latest = await loadSettings();
    if (latest.blocklist.length >= MAX_ENTRIES) {
      setStatus({ message: t("optTooMany", MAX_ENTRIES), kind: "error" });
      return;
    }
    const result = mergeEntries(latest.blocklist, [entry]);
    if (result.added === 0) {
      setStatus({ message: t("optDuplicate"), kind: "error" });
      return;
    }
    await saveSettings({ blocklist: result.entries });
    setValue("");
    setNote("");
    setStatus(clear);
    valueRef.current?.focus();
  };

  const remove = async (key: string) => {
    const latest = await loadSettings();
    await saveSettings({ blocklist: removeEntry(latest.blocklist, key) });
  };

  return (
    <Group title={t("optBlocklist")}>
      <p className="mb-2 text-[14px]">{t("optBlocklistHelp")}</p>
      {!allowed && (
        <p id="user-list-disabled" className="mb-2 text-[14px] text-alert">
          {t("optUserListDisabled")}
        </p>
      )}
      <fieldset disabled={!allowed} className="contents">
        <form id="block-form" onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as EntryType)}>
            <SelectTrigger id="block-type" className="w-[150px]" aria-label={t("optColType")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {ENTRY_TYPES.map((type) => (
                <SelectItem key={type} value={type} data-value={type}>
                  {t(typeLabels[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            id="block-value"
            ref={valueRef}
            className="w-auto flex-[3_1_220px]"
            placeholder={t(placeholders[type])}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />
          <Input
            id="block-note"
            className="w-auto flex-[1_1_140px]"
            placeholder={t("optNotePlaceholder")}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoComplete="off"
          />
          <Button type="submit" variant="default">
            {t("btnAdd")}
          </Button>
        </form>
      </fieldset>
      <Status {...status} />

      <div className="mt-1 mb-2 flex items-center gap-3">
        <Input
          id="block-filter"
          className="w-[240px]"
          placeholder={t("optFilterPlaceholder")}
          aria-label={t("optFilterPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoComplete="off"
        />
        <span id="block-count" className="text-[14px]">
          {t("optCount", entries.length)}
        </span>
      </div>
      <EntriesTable
        id="block-rows"
        entries={visible}
        onRemove={allowed ? (entry) => void remove(entryKey(entry)) : undefined}
      />
      {entries.length === 0 && (
        <p id="block-empty" className="mt-2 text-[14px]">
          {t("optBlocklistEmpty")}
        </p>
      )}
    </Group>
  );
}

function ImportExportGroup({ entries, allowed }: { entries: BlockEntry[]; allowed: boolean }) {
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [status, setStatus] = useState<StatusState>(clear);
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    let parsed: { entries: BlockEntry[]; invalid: number[] };
    try {
      parsed = parseImport(await file.text());
    } catch (err) {
      const key = err instanceof ImportError ? importErrorMessages[err.message] : undefined;
      setStatus({ message: key ? t(key, MAX_ENTRIES) : String(err), kind: "error" });
      return;
    }
    const latest = await loadSettings();
    const result = mergeEntries(mode === "replace" ? [] : latest.blocklist, parsed.entries);
    if (result.entries.length > MAX_ENTRIES) {
      setStatus({ message: t("optTooMany", MAX_ENTRIES), kind: "error" });
      return;
    }
    await saveSettings({ blocklist: result.entries });
    const detail =
      result.duplicates > 0 || parsed.invalid.length > 0
        ? ` ${t("optImportedDetail", result.duplicates, parsed.invalid.length)}`
        : "";
    setStatus({ message: `${t("optImported", result.added)}${detail}`, kind: "ok" });
  };

  const download = (text: string, type: string, name: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name.replace("{date}", new Date().toISOString().slice(0, 10));
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportJson = () =>
    download(toExportJson(entries), "application/json", "mail-link-guard-blocklist-{date}.json");

  return (
    <Group title={t("optImportExport")}>
      <p className="mb-2 text-[14px]">{t("optImportHelp")}</p>
      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "merge" | "replace")}>
        <Label>
          <RadioGroupItem value="merge" />
          {t("optImportMerge")}
        </Label>
        <Label>
          <RadioGroupItem value="replace" />
          {t("optImportReplace")}
        </Label>
      </RadioGroup>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button id="import-button" disabled={!allowed} onClick={() => fileRef.current?.click()}>
          {t("btnImport")}
        </Button>
        <Button id="export-button" onClick={exportJson}>
          {t("btnExport")}
        </Button>
        <input
          ref={fileRef}
          id="import-file"
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>
      <div id="import-status">
        <Status {...status} />
      </div>
    </Group>
  );
}

function Options() {
  const settings = useSettings();
  const policy = usePolicy();
  if (!settings || !policy) return null;
  const locked = policy.enforcedEnabled !== undefined;
  return (
    <MacWindow title={t("optTitle")} className="mx-auto my-6 max-w-[760px]">
      <p className="mt-2 text-[14px]">{t("optPrivacy")}</p>

      <Group title={t("optGeneral")}>
        <Label>
          <Checkbox
            id="enabled"
            checked={policy.enforcedEnabled ?? settings.enabled}
            disabled={locked}
            onCheckedChange={(v) => void saveSettings({ enabled: v === true })}
          />
          {t("optEnabled")}
        </Label>
        {locked && (
          <p id="enabled-locked" className="mt-1 text-[14px]">
            {t(policy.enforcedEnabled ? "optLockedOn" : "optLockedOff")}
          </p>
        )}
      </Group>

      {(policy.enforcedBlocklist.length > 0 || policy.enforcedAllowlist.length > 0) && (
        <ManagedGroup blocklist={policy.enforcedBlocklist} allowlist={policy.enforcedAllowlist} />
      )}
      <BlocklistGroup entries={settings.blocklist} allowed={policy.allowUserBlocklist} />
      <ImportExportGroup entries={settings.blocklist} allowed={policy.allowUserBlocklist} />
      <AllowlistGroup entries={settings.allowlist} allowed={policy.allowUserAllowlist} />

      <Group title={t("optAbout")}>
        <p id="version" className="text-[14px]">
          {t("optVersion", chrome.runtime.getManifest().version)}
        </p>
        <p className="mt-1 text-[14px]">{t("optOpenSource")}</p>
        <ul className="links mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
          <li>
            <a href={REPOSITORY} target="_blank" rel="noopener noreferrer">
              {t("linkSource")}
            </a>
          </li>
          <li>
            <a href="LICENSE.txt" target="_blank" rel="noopener noreferrer">
              {t("linkLicense")}
            </a>
          </li>
          <li>
            <a
              href={`${REPOSITORY}/blob/main/PRIVACY.md`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("linkPrivacy")}
            </a>
          </li>
          <li>
            <a href={`${REPOSITORY}/issues`} target="_blank" rel="noopener noreferrer">
              {t("linkIssues")}
            </a>
          </li>
        </ul>
      </Group>
    </MacWindow>
  );
}

localizePage();
const root = document.getElementById("root");
if (root) createRoot(root).render(<Options />);
