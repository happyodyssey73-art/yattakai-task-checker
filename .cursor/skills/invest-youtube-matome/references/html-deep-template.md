# deep HTML（`deep.html`）— 正本（中身重視・引用つき）

## 目的

`index.html`（compact）は「短時間で比較できる」ことを最優先にし、`deep.html` は **YouTube の発言（タイムスタンプ引用）に寄せて“中身感”を最大化**する。

- deep の基本方針: **1動画あたり引用 2〜3 個**（短い原文）＋ `t=` 付きリンクで一次へ飛べる。
- **引用できない動画**（`description_only` / `summary_only`）は deep では **掲載縮小**し、主張は弱め／**判断保留**寄りに倒す（捏造禁止）。
- 免責・自動字幕の限界注記は compact と同等に必須（`legal-disclaimer.md`）。

## ファイル

- `index.html`: compact（既存ルール: `html-compact-template.md`）
- `deep.html`: 本ファイル（deep）

## deep の必須 DOM id（機械チェック対象）

| id | 内容 |
|----|------|
| `iyt-deep-header` | deep のヘッダ（JST、窓、要約、evidence凡例） |
| `iyt-deep-channel-cards` | **チャンネル順**の動画カード（主役） |
| `iyt-deep-clusters` | クラスタ別の横比較（リンク集＋代表2主張の“証拠つきディベート”） |
| `iyt-deep-verify-map` | 裏取りの照合マップ（ニュース→どの主張に効くか） |
| `iyt-deep-footer` | 動画リンク集＋免責（compact と同等） |

## deep のセクション順（推奨・上から）

1. `#iyt-deep-header` — 3行TL;DR（争点／割れてる前提／読む順）＋ evidence 凡例（official/auto/desc/summary）
2. `#iyt-deep-channel-cards` — **チャンネル順**の動画カード（各カードに引用 2〜3）
3. `#iyt-deep-clusters` — クラスタ別の横串比較（“同テーマ比較”のための再掲）
4. `#iyt-deep-verify-map` — 裏取り（ニュース→主張への対応付け）
5. `#iyt-deep-footer` — 免責・動画リンク集

## 動画カード（チャンネル順）— 必須フォーマット

各カードは同じ型に統一する（パッチワーク化防止）。

- **動画タイトル**（リンク）＋公開日時（JST）＋ `evidence_grade` バッジ
- **結論（1行）**
- **推論の鎖（短く）**: 前提 → 観測点 → if-then → 結論 → 反証条件（不明なら「動画内で明示なし」）
- **タイムスタンプ引用（2〜3）**
  - 引用は必ず `<span data-iyt-quote="1">…</span>` で包む（`html-compact-template.md` と同一ルール）
  - 引用の直後に `t=` 付きリンク（例: `https://www.youtube.com/watch?v=ID&t=123s`）
  - 自動字幕由来ならバッジと注意文（短く）
- **クラスタへの内部リンク**（例: `#cluster-fed` へ）

### 引用の上限（推奨）

- 1引用: **240字以下**
- 1動画: **2〜3引用**
- 1クラスタの A/B ディベート: **各サイド1引用**（合計2）

## クラスタ別（横串）— “証拠つきディベート”

`disagreement-labels.md` の **代表2主張・対立軸1本**は維持しつつ、deep では次を追加する。

- 代表A: `claim_one_liner` ＋ もっとも近い引用（1つ）＋ `t=` リンク
- 代表B: 同上
- 分岐点（前提／観測点／条件）を 1〜2 段で説明（**引用に基づく範囲**に限定）
- 引用が無い場合は **判断保留**と明記し、無理に対立を確定しない

## 裏取り（照合マップ）

`verification-rubric.md` のラベルは維持しつつ、deep では「ニュースがどの主張に効くか」を可視化する。

- 1ニュース項目につき:
  - 効く `claim_id`（または代表A/B）
  - 一致 / 一部のみ整合 / 未確認（ラベル）
  - 1行理由（時点ズレ・定義ズレ・前提ズレ等）

## deep のチェック（推奨）

生成後は次を実行する（`--mode deep`）。

```bash
node scripts/check_invest_youtube_matome.mjs --file deep.html --mode deep
```

