# Phase 3 凍結: `clusters[]` 成果物スキーマ（正本）

Phase 2（クラスタリング）直後に **Phase 3 で凍結**する。以降の Phase 4〜7 で参照する **単一の真実** とする。旧ファイル名は `phase1-output-schema.md`（履歴・ブックマーク用に残る場合あり）。

## 必須トップレベル

```json
{
  "as_of": "2026-04-24T21:00:00+09:00",
  "video_window": "2d",
  "claim_cards": [],
  "clusters": []
}
```

- `as_of`: **日本標準時（JST）** の ISO-8601（タイムゾーン `+09:00` 推奨）。`window-and-triggers.md` と同一基準。  
- `video_window`: `2d` | `7d`  
- `claim_cards`: `claim-normalization.md` に準拠したオブジェクトの配列。各要素に **`id`（必須）** を付与（例 `cc1`）。  
- `clusters`: 下記スキーマの配列。

## `clusters[]` 各要素（必須）

| フィールド | 型 | 必須 | 説明 |
|------------|-----|------|------|
| `cluster_id` | string | はい | 例 `c1`, `rates-us` |
| `display_name` | string | はい | 読者向け短名 |
| `requires_en_primary` | boolean | はい | 米株・金利系なら `true` |
| `claim_card_ids` | string[] | はい | このクラスタに属する主張カードの `id`。**1件以上** |

## 例

```json
{
  "as_of": "2026-04-24T21:00:00+09:00",
  "video_window": "2d",
  "claim_cards": [
    {
      "id": "cc1",
      "channel_handle": "@nobujuku",
      "video_id": "abc123",
      "video_url": "https://www.youtube.com/watch?v=abc123",
      "published_at": "2026-04-24T12:00:00+09:00",
      "evidence_grade": "transcript_auto",
      "tags": ["金利", "米株"],
      "stance": "bull",
      "horizon": "short",
      "claim_one_liner": "金利ピークアウトでハイテクに資金戻り",
      "reason_type": "rates"
    }
  ],
  "clusters": [
    {
      "cluster_id": "c1",
      "display_name": "米金利とハイテク",
      "requires_en_primary": true,
      "claim_card_ids": ["cc1"]
    }
  ]
}
```

## ルール

- `requires_en_primary: true` のクラスタでは、Phase 5 の **5a→5b** を必須（`verification-rubric.md`）。  
- Phase 4（代表2主張）は **各 `cluster_id` ごと**に実行する。  
- バリデーション補助: `node scripts/validate-phase0-json.mjs --file path/to/phase0.json`（Phase 0 用）と併用する。
