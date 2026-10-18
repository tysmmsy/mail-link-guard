# Privacy Policy

Last updated: 2026-10-18

Mail Link Guard is a Chrome extension that shows where a webmail link goes before it opens and blocks destinations on the user's own blocklist. Its source code is public at https://github.com/tysmmsy/mail-link-guard, so anyone can check the statements below against the code.

## What is stored

The extension stores exactly three items in `chrome.storage.local` on your device:

| Item | Contents |
|---|---|
| `enabled` | Whether links are checked |
| `blocklist` | Each entry's type, value, optional note and date added |
| `allowlist` | Each allowed host, whether subdomains are included, optional note and date added |

`chrome.storage.local` is not synced to your Google account or to other devices.

If your organization manages Chrome, it may set rules (such as blocklist entries) through Chrome policy. Chrome delivers them to the read-only `chrome.storage.managed`; the extension only reads them and reports nothing back.

## What is read but not stored

When you click a link in a message, the extension reads that link's URL and visible text to show them in the confirmation dialog. They are kept in memory only while the dialog is open and are discarded when it closes. The extension does not read message contents.

## What is not collected

No message contents, browsing or click history, cookies, credentials, location, or analytics. There is no server and no account.

## Sharing and transfer

The extension makes no network requests, so no data leaves your device. Nothing is sold or shared. Your blocklist leaves the device only when you export it to a file yourself.

## Deleting your data

Delete entries on the options page, or remove the extension. Removing the extension deletes everything it stored.

## Changes

Changes to this policy are published in this file in the repository, with a new "Last updated" date.

## Contact

Open an issue at https://github.com/tysmmsy/mail-link-guard/issues.

---

# プライバシーポリシー

最終更新日：2026年10月18日

Mail Link Guardは、Webメールのリンクを開く前に行き先を表示し、ブロックリストの行き先を開かないChrome拡張機能です。
ソースコードは https://github.com/tysmmsy/mail-link-guard で公開しており、以下の内容をコードで確かめられます。

## 保存するもの

お使いの端末の`chrome.storage.local`に、次の3つだけを保存します。

| 項目 | 中身 |
|---|---|
| `enabled` | リンクを確認するかどうか |
| `blocklist` | 各項目の種類、値、任意のメモ、登録日 |
| `allowlist` | 許可したホスト、サブドメインを含むか、任意のメモ、登録日 |

`chrome.storage.local`は、Googleアカウントやほかの端末には同期されません。

組織がChromeを管理している場合、ポリシーでルールが設定されることがあります。
拡張機能はそれを読み取り専用の`chrome.storage.managed`から読むだけで、何も送り返しません。

## 読み取るが保存しないもの

クリックしたリンクのURLと表示文字を、ダイアログに表示するために読み取ります。
ダイアログを閉じると破棄します。
メールの内容は読み取りません。

## 収集しないもの

メールの内容、閲覧やクリックの履歴、Cookie、認証情報、位置情報、利用状況の解析データは収集しません。
サーバーもアカウントもありません。

## 共有と送信

拡張機能は外部と通信しないため、データが端末の外に出ることはありません。
販売も共有もしません。
ブロックリストが端末の外に出るのは、利用者が自分でファイルにエクスポートしたときだけです。

## データの削除

設定画面でブロックリストの項目を削除するか、拡張機能を削除してください。
拡張機能を削除すると、保存したデータはすべて消えます。

## 変更

このポリシーを変更するときは、リポジトリのこのファイルを更新し、最終更新日を改めます。

## 連絡先

https://github.com/tysmmsy/mail-link-guard/issues にIssueを作成してください。
