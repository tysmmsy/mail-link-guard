# 組織への展開

管理者は、Chromeのポリシーで設定を全員に強制できます。
ポリシーはChromeが`chrome.storage.managed`として拡張機能に渡し、拡張機能は読むだけです。
外部とは通信せず、管理者に何も送り返しません。

## 設定できるポリシー

| ポリシー | 型 | 効果 |
|---|---|---|
| `enforcedEnabled` | 真偽値 | `true`にすると、全員のリンクの確認とブロックを常にオンにします。`false`なら常にオフです。設定しなければ利用者が選べます。 |
| `enforcedBlocklist` | `{ "type", "value", "note" }`の配列 | 全員に適用するブロックリストです。利用者の設定画面には「組織の設定」として表示され、削除できません。`type`は`domain`、`url`、`wildcard`、`regex`のいずれかで、書き方は設定画面と同じです。不正な項目は無視します。 |
| `allowUserBlocklist` | 真偽値 | `false`にすると、利用者が自分で登録した項目を無視し、追加とインポートもできなくします。`enforcedBlocklist`だけが適用されます。既定は`true`です。 |

スキーマは[static/managed_schema.json](../static/managed_schema.json)です。
初期登録の3件は利用者のリストに入るため、`allowUserBlocklist`を`false`にすると効かなくなります。
残す場合は、`DEFAULT_PATTERNS`の値を`enforcedBlocklist`に加えてください。

管理者がブロックした行き先のリンクをクリックすると、「組織の管理者がブロックしています」と表示し、開けません。

## 拡張機能のID

ポリシーは拡張機能のIDに結び付きます。
Chrome Web StoreのIDを使ってください。
手元で読み込んだ版のIDはフォルダの場所で決まるため、1台での試験にしか使えません。

## Google管理コンソール

「デバイス」>「Chrome」>「アプリと拡張機能」>「ユーザーとブラウザ」で拡張機能を選び、「拡張機能に適用するポリシー」に次の形のJSONを貼り付けます。

```json
{
  "enforcedEnabled": { "Value": true },
  "allowUserBlocklist": { "Value": true },
  "enforcedBlocklist": {
    "Value": [
      { "type": "domain", "value": "known-phishing.example", "note": "情報システム部が2026-10-01に登録" },
      { "type": "wildcard", "value": "*-login-*.example", "note": "偽のログインページ" },
      { "type": "regex", "value": "^https?://[^/]*paypa[l1]\\.", "note": "PayPalに似せたドメイン" }
    ]
  }
}
```

インストールのポリシーを「強制インストール」にすると、利用者は拡張機能を削除できません。

## Windows（グループポリシーまたはレジストリ）

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\<拡張機能のID>\policy]
"enforcedEnabled"=dword:00000001
"allowUserBlocklist"=dword:00000001
"enforcedBlocklist"="[{\"type\":\"domain\",\"value\":\"known-phishing.example\",\"note\":\"情報システム部が登録\"}]"
```

配列はJSONの文字列で書きます。
強制インストールには`ExtensionInstallForcelist`ポリシーを使います。

## macOS（構成プロファイル）

ドメイン`com.google.Chrome.extensions.<拡張機能のID>`の管理対象の環境設定として配布します。

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
    <key>note</key><string>情報システム部が登録</string>
  </dict>
</array>
```

## 反映の確かめ方

`chrome://policy`の拡張機能のIDの欄に、届いたポリシーとエラーが表示されます。
設定画面には、再読み込みなしで管理者の項目が表示されます。
