# Phase 0: YouTube 収集プロンプト（返却形式の正本）

## 親エージェントが先に行うこと

サブエージェント（explore 等）はリポジトリファイルを自動では読めない。**Phase 0-pre** で親が次を読み、プロンプトにそのまま貼る。

- `channels.md` の URL リスト（`{channels_override}` 適用後）  
- `{動画鮮度窓}`（`2d` / `7d`）および **`as_of` は JST**（`window-and-triggers.md`）  
- `video-selection.md` の相場系定義・さかのぼり上限 `N`  
- `{ニュース鮮度}`（ニュース・X用。動画窓とは別）

## 収集タスク（サブエージェント向け要約）

1. 各チャンネルについて、窓内の最新から **相場系動画を最大1本** 特定（非相場系は `video-selection` に従い無視／さかのぼり）。  
2. 可能なら **字幕・トランスクリプト** の有無を確認（取得手段はツール可能範囲で）。  
3. 各採用動画から **主張候補** を3つまで抽出（後で主張カード化）。  
4. X / Google トレンドで、`{ニュース鮮度}` に合う **バズワード・テーマ株の例** があれば列挙（出典メモ）。

## deep 用（重要）

deep.html は **動画の発言（タイムスタンプ引用）に寄せる**ため、可能な範囲で次を追加する。

- `evidence_grade` が `transcript_official` または `transcript_auto` の場合は、`video.transcript_excerpts` を **2〜3件**返す（短い原文＋開始秒）。
- `description_only` / `summary_only` の場合は `transcript_excerpts` は空配列でよい（その代わり `evidence_notes` に「引用不可・要約のみ」等を明記）。

## 必須フィールド（トップレベル）

| フィールド | 必須 | 型・値 |
|------------|------|--------|
| `as_of` | はい | ISO-8601、**JST（+09:00）** 推奨 |
| `video_window` | はい | `2d` または `7d` のみ |
| `channels` | はい | 配列。**Phase 0-pre で渡した各 ch がちょうど1要素**（欠落禁止） |
| `trends` | はい | オブジェクト。`x_themes`・`google_trends_keywords` は空配列可 |

## `channels[]` 各要素の必須

| フィールド | 必須 | 説明 |
|------------|------|------|
| `channel_handle` | はい | 例 `@nobujuku` |
| `channel_url` | はい | 公式 URL |
| `included` | はい | `true`: 今回の対象。`false`: `{channels_override}` で除外 |
| `video` | 条件付き | `included: true` のとき **オブジェクトまたは `null`** |
| `skip_reason` | 条件付き | **`included: true` かつ `video` が `null` のとき必須**（下表） |

### `skip_reason` 列挙（この値のみ）

| 値 | 使うとき |
|----|----------|
| `no_market_video_in_window` | 窓内に相場系が無い（非表示 ch） |
| `fetch_failed` | 取得エラー・タイムアウト |
| `parse_error` | ページは取れたが必須フィールドが取れない |

`included: false` のときは **`video` は必ず `null`**。`skip_reason` は任意（推奨: `user_excluded` を付けてもよいが、バリデータは `included: false` では `skip_reason` 未検査）。

## 欠損時の扱い

- **必須が欠ける・`video_window` が不正** → Phase 0 を **再実行**（同条件でリトライ1回まで推奨）。  
- バリデーション: `node scripts/validate-phase0-json.mjs --file path/to/saved.json`

## 返却JSON（構造の正本）

```json
{
  "as_of": "2026-04-24T21:00:00+09:00",
  "video_window": "2d",
  "channels": [
    {
      "channel_handle": "@example",
      "channel_url": "https://www.youtube.com/@example",
      "included": true,
      "skip_reason": "no_market_video_in_window",
      "video": null
    },
    {
      "channel_handle": "@other",
      "channel_url": "https://www.youtube.com/@other",
      "included": true,
      "video": {
        "video_id": "string",
        "url": "https://www.youtube.com/watch?v=...",
        "title": "string",
        "published_at": "2026-04-24T12:00:00+09:00",
        "market_related": true,
        "evidence_grade": "transcript_official|transcript_auto|description_only|summary_only",
        "evidence_notes": "自動字幕のため誤認識の可能性あり、等",
        "transcript_excerpts": [
          {
            "text": "短い引用（原文。240字以下推奨）",
            "start_sec": 123,
            "end_sec": 140,
            "grade": "transcript_official|transcript_auto",
            "notes": "自動字幕の可能性あり、等（任意）"
          }
        ],
        "claim_candidates": [
          { "text": "string", "horizon": "short|mid|long|unknown" }
        ]
      }
    },
    {
      "channel_handle": "@excluded",
      "channel_url": "https://www.youtube.com/@excluded",
      "included": false,
      "video": null
    }
  ],
  "trends": {
    "x_themes": [],
    "google_trends_keywords": []
  }
}
```

### `included: false`

`{channels_override}` で除外されたチャンネル。`video` は `null`。

### `video` がオブジェクトのとき（必須サブフィールド）

`video_id`, `url`, `title`, `published_at`, `market_related`, `evidence_grade`, `claim_candidates`（配列。空可だが推奨は1〜3件）

## evidence_grade（定義）

| 値 | 意味 |
|----|------|
| `transcript_official` | 公式字幕・提供トランスクリプトに基づく抽出。 |
| `transcript_auto` | 自動字幕に基づく。**本文に自動字幕である旨と限界を1文注記**。 |
| `description_only` | 説明欄・章立てのみ。 |
| `summary_only` | 要約のみ。**「要約は解釈を含む」** を必ず併記可能な形で渡す。 |

## `transcript_excerpts`（deep 用）

- `evidence_grade` が `transcript_official` / `transcript_auto` の場合は **2〜3件**推奨（多すぎる引用は禁止）。
- `text` は **平文**（HTMLタグ無し）で、公開 HTML では `<span data-iyt-quote="1">...</span>` で包む。
- `start_sec` は `url?t=STARTs` に使う。`end_sec` は任意。

## 禁止

- 窓外動画を `video` に入れない。  
- 推測で主張を捏造しない。取れない場合は `summary_only` に落とし、不確実性を `evidence_notes` に書く。

## 公開 HTML との対応（引用ラッパ）

読者向け本文で YouTube 発言を短く引用するときは、**平文のみ**を `<span data-iyt-quote="1">...</span>` で包む（ネスト禁止）。機械チェックの除外に使う。
