# Deploying to an organization

Administrators can enforce Mail Link Guard settings for everyone through Chrome policy. Chrome delivers the policy from the management system to each browser and exposes it to the extension through `chrome.storage.managed`. The extension only reads it; it still makes no network requests, and nothing is reported back to the administrator.

## Policies

| Policy | Type | Effect |
|---|---|---|
| `enforcedEnabled` | boolean | `true` keeps link checking and blocking on for every user. `false` keeps it off. Unset: users decide. |
| `enforcedBlocklist` | array of `{ "type", "value", "note" }` | Entries applied for every user. Users see them on the options page under "Set by your organization" and cannot remove them. `type` is `domain`, `url`, `wildcard` or `regex`, with the same rules as the options page. Invalid entries are ignored. |
| `allowUserBlocklist` | boolean | `false` ignores entries users added themselves and disables adding and importing, so only `enforcedBlocklist` applies. Default: `true`. |

The schema is [static/managed_schema.json](../static/managed_schema.json). The default entries a new install starts with belong to the user's own list, so `allowUserBlocklist: false` also turns them off; add them to `enforcedBlocklist` if you want to keep them (their values are in the README).

A link to an enforced destination shows "Your organization's administrator blocks this destination" and cannot be opened.

## Extension ID

Policies are tied to the extension ID. Use the ID of the Chrome Web Store listing. An unpacked copy gets an ID derived from its folder path, so it is only useful for testing on one machine.

## Google Admin console

Devices > Chrome > Apps & extensions > Users & browsers, select the extension, and paste JSON into "Policy for extensions":

```json
{
  "enforcedEnabled": { "Value": true },
  "allowUserBlocklist": { "Value": true },
  "enforcedBlocklist": {
    "Value": [
      { "type": "domain", "value": "known-phishing.example", "note": "Reported by IT on 2026-10-01" },
      { "type": "wildcard", "value": "*-login-*.example", "note": "Fake sign-in pages" },
      { "type": "regex", "value": "^https?://[^/]*paypa[l1]\\.", "note": "PayPal lookalikes" }
    ]
  }
}
```

Set the installation policy to "Force install" so users cannot remove the extension.

### Keeping the list in Git

Keep the organization's list as a file exported from the options page and generate the policy JSON from it:

```sh
pnpm policy blocklist.json > policy.json
```

The command fails when an entry cannot be read, so it can also check the list in CI.

## Windows (Group Policy or registry)

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\<EXTENSION_ID>\policy]
"enforcedEnabled"=dword:00000001
"allowUserBlocklist"=dword:00000001
"enforcedBlocklist"="[{\"type\":\"domain\",\"value\":\"known-phishing.example\",\"note\":\"Reported by IT\"}]"
```

Lists are written as a JSON string. Force installation uses the `ExtensionInstallForcelist` policy.

## macOS (configuration profile)

Deliver a managed preferences payload for the domain `com.google.Chrome.extensions.<EXTENSION_ID>`:

```xml
<key>enforcedEnabled</key>
<true/>
<key>allowUserBlocklist</key>
<true/>
<key>enforcedBlocklist</key>
<array>
  <dict>
    <key>type</key><string>domain</string>
    <key>value</key><string>known-phishing.example</string>
    <key>note</key><string>Reported by IT</string>
  </dict>
</array>
```

## Checking the result

Open `chrome://policy` and look for the extension's ID: the policies and any validation errors are listed there. The extension's options page shows enforced entries and a locked switch as soon as the policy arrives; no reload is needed.
