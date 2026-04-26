# 主張カード（正本）

Phase 1 で、Phase 0 の `claim_candidates` を次の形に正規化する。

## フィールド

| フィールド | 型 | 説明 |
|------------|-----|------|
| `id` | string | **必須**。`cc1` 形式など、`clusters-output-schema.md` の `claim_card_ids` から参照する |
| `channel_handle` | string | 出典チャンネル |
| `video_id` | string | YouTube video id |
| `video_url` | string | フルURL |
| `published_at` | string | 表示用も含め明記 |
| `evidence_grade` | enum | research-prompt と同じ |
| `tags` | string[] | 2〜4個。下記タグ語彙から |
| `stance` | enum | `strong_bull` `bull` `neutral` `bear` `strong_bear` `unclear` |
| `horizon` | enum | `short`（数日〜数週間） `mid`（数ヶ月） `long`（年単位） `unknown` |
| `claim_one_liner` | string | **1文**で結論（読者向け） |
| `reason_type` | enum | `macro` `rates` `earnings` `technical` `flow` `geopolitics` `policy` `sentiment` `other` |
| `key_assumption` | string | 省略可。前提が1つあるなら1文 |
| `evidence_excerpts` | object[] | deep 用。引用できる場合のみ（最大3）。次を含む: `text` `start_sec` `grade`（必要なら `end_sec` `notes`） |

## タグ語彙（例）

金利、FRB、地政学、為替、ドル円、円安、米株、日株、中国、インド、欧州、原油、金、暗号、VIX、セクター、個別、決算、インフレ、景気後退、AI、ハイテク、金融株、など。**自由追加より既存への寄せ**を優先し、クラスタが散らばりすぎないようにする。

## ルール

- 動画あたり **主張カードは最大3**（compact のため）。  
- `stance` が `unclear` なら `claim_one_liner` は「主張がはっきりしない」と明記し、比較表では弱いセルにする。  
- **窓外動画からの主張カードは作らない。**
- deep は **引用 2〜3/動画**を目標にする。`evidence_grade` が `transcript_official` / `transcript_auto` で、Phase 0 に `video.transcript_excerpts` がある場合は、主張カードに `evidence_excerpts` を 0〜1 件ずつ割り当てる（同じ引用の使い回し可）。引用が無いカードは deep では **判断保留**扱いに寄せる。
