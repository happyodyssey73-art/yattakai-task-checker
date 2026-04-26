# 実行手順（Runbook）: YouTube Data API + yt-dlp で Phase 0 を作る

## ゴール

- `{動画鮮度窓}=2d/7d` の範囲で、固定チャンネルから「相場系」動画を各1本まで特定する
- 字幕が取れる動画だけ `transcript_excerpts`（2〜3）を付与し、deep 側で厚く扱える状態にする
- 生成物 `phase0.json` を `validate-phase0-json.mjs` で通す

## 前提

- Node.js が使えること（本リポジトリは `type: module`）
- `yt-dlp` が PATH に入っていること
- YouTube Data API v3 の API キーを用意していること

## 1) YouTube Data API キーの作成（最小）

1. `https://console.cloud.google.com/` を開く
2. プロジェクトを作成（例: `invest-youtube-matome`）
3. 「APIとサービス」→「ライブラリ」→ **YouTube Data API v3** を有効化
4. 「APIとサービス」→「認証情報」→「APIキー」を作成
5. **推奨**: API制限で「YouTube Data API v3」のみに絞る

## 2) yt-dlp の導入（Windows例）

どれか1つでOK。

### A) winget

```powershell
winget install yt-dlp.yt-dlp
```

### B) pipx

```powershell
pipx install yt-dlp
```

導入後に確認:

```powershell
yt-dlp --version
```

## 3) Phase 0 を生成（Data API → 字幕 → バリデーション）

PowerShell例（APIキーは環境変数で渡す。Gitにコミットしない）:

```powershell
$env:YOUTUBE_API_KEY = "YOUR_KEY"
node .cursor/skills/invest-youtube-matome/scripts/phase0_make.mjs --window 2d --out tmp/phase0.json
```

出力:

- `tmp/phase0.raw.json`（Data APIのみ）
- `tmp/phase0.json`（字幕で `transcript_excerpts` を付与した後）

## 4) 生成後チェック（手動）

- `phase0.json` の各 `channels[].video.evidence_grade` を確認し、`transcript_auto` が付いている動画が deep で厚くなる対象
- `description_only/summary_only` の動画は deep では **掲載縮小＋判断保留**に倒す

## トラブルシュート（よくある）

- `fetch_failed` が多い:
  - APIキーが無効 / API未有効化 / クォータ / ネットワーク
  - チャンネルID解決が失敗する場合は `channels.md` の URL が正しいか確認
- `yt-dlp` が字幕を取れない:
  - 動画側で字幕が無い / 自動字幕が無効 / 年齢制限 / 地域制限
  - その場合は仕様どおり `transcript_excerpts=[]` で deep は縮小表示

