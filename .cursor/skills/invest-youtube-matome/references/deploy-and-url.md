# デプロイと URL（本スキル運用）

全リポジトリでスキル本体を使う場合は **[install-global.md](install-global.md)** を参照。

## 原則（毎回 Surge で閲覧可能にする）

- **本スキルで読者向け HTML を出すときは、毎回 Surge にデプロイ**し、**ブラウザでその URL が開ける状態**までを完了とする。ローカルファイルだけ置いて終わりにしない。  
- **同一記事の URL は一本化**する。`docs/{ドメイン名}/` と surge ドメインを一致させる運用が望ましい（diagram-invest と同型）。  
- `og:url` とシェア用 URL を **デプロイ後の絶対 URL** で揃える。

## 手順（Surge）

1. HTML とアセットを `docs/{ドメイン名}/` に配置（例: `docs/invest-youtube-20260424/`）。  
2. そのディレクトリに `cd` してから:

   ```bash
   surge . --domain {ドメイン名}.surge.sh
   ```

3. デプロイが成功したら **公開 URL**（例 `https://{ドメイン名}.surge.sh/`）を控える。  
4. 旧 URL を残さない方針なら teardown やリダイレクト方針を別ドキュメントで管理。

## デプロイ完了メール（既定宛先）

デプロイが終わったら **happyodyssey73@gmail.com** に「公開 URL が分かる」通知を送る。

### 自動送信（推奨: Resend）

1. [Resend](https://resend.com) で API キーを発行し、送信元ドメインまたは許可された `from` を用意する。  
2. シェルで環境変数を設定（値は各自の秘密情報。リポジトリにコミットしない）:

   ```powershell
   $env:RESEND_API_KEY = "re_...."
   $env:RESEND_FROM = "Digest Bot <onboarding@resend.dev>"
   $env:DEPLOY_NOTIFY_TO = "happyodyssey73@gmail.com"
   ```

   `DEPLOY_NOTIFY_TO` を省略すると既定で **happyodyssey73@gmail.com** に送る。

3. Surge 直後に実行:

   ```bash
   node scripts/notify_deploy_complete.mjs --url "https://{ドメイン名}.surge.sh/" --title "記事の短い名前"
   ```

   スキルディレクトリ外から実行する場合は `notify_deploy_complete.mjs` へのパスをフルパスにする。

`RESEND_API_KEY` / `RESEND_FROM` が無い場合、スクリプトは **メールを送らず** 手動転送用の To/Subject/Body を標準出力する（終了コード 0）。

### 手動（環境変数をまだ置かないとき）

Surge の出力 URL をコピーし、**happyodyssey73@gmail.com** に「公開しました」と本文に URL を貼って送る。上記スクリプトを叩くとコピー用の文面が出る。

## 画像

- キャラ画像を使う場合は diagram-invest と同じコピー手順でよい（パスは環境に合わせて README に記載）。
