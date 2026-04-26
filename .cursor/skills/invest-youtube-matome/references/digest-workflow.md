# 全市場ダイジェスト内部手順（正本）

## ゴール

「各チャンネルの最新の相場系発信」を **同じ軸**で並べ、**クラスタ内**で比較と裏取りを成立させる。

## ステップ（厳守順）

### S1 横並び収集

- `{channels_override}` を適用したリストごとに、窓内で **相場系動画を最大1本**（`video-selection.md`）。  
- 該当なしは **非表示**。

### S2 主張カード化

- `claim-normalization.md` に従い、動画あたり最大3枚。**各カードに `id` 必須**。

### S3 タグ付け

- 各カードにタグ2〜4。

### S4 クラスタリング

- `clustering.md` に従い **最大5クラスタ**。  
- 米株・金利系には `requires_en_primary: true`。

### S4b 凍結（Phase 3）

- `clusters-output-schema.md` に沿い **`clusters[]` と `claim_cards[]` を確定**し、以降は改変しない（誤り修正のみ）。

### S5 比較マトリクス

- **クラスタ単位**で表を生成。全チャンネル一括の巨大表は作らない。

### S6 代表2主張 + ラベル

- `disagreement-labels.md` に従い、**代表2・対立軸1本**。

### S7 裏取りストリップ

- `verification-rubric.md` + `sources-news.md`。  
- `requires_en_primary` クラスタは **5a→5b**。

### S8 市場体温ミニ

- `market-snapshot.md`。compact では最小。

### S9 HTML（Phase 7）

**正本の順で開く**: [html-structure.md](html-structure.md)（骨格・CSS）→ [exemplar.md](exemplar.md)（読み順・ワイヤ）→ [html-compact-template.md](html-compact-template.md)（compact の必須 id・引用・表ルール）→ [html-deep-template.md](html-deep-template.md)（deep の必須 id・引用密度・照合マップ）。

1. **`exemplar.md` の読み順**どおりにセクションを並べる（`iyt-read-path` は **マトリクスより上**）。  
2. **`html-structure.md` のレイヤー**に従う: `header` →（任意）`nav.toc-float` → **`<main class="max-w-…">`** 内を **`.section-card`** で区切る。  
3. **必須 `id`**: `iyt-read-path`（まず読む3つ）、`iyt-executive`、`iyt-dual-signal`、`iyt-my-strategy`（`html-compact-template.md`）。  
4. **マトリクス**: クラスタごとに 1 カード。チャンネル列が多い場合は **`exemplar.md` の二段パターン**（スマホはカード、`md:` 以上で表）を既定とする。  
5. **Lucide**: `data-lucide` 使用後、**`lucide.createIcons();`** を `</body>` 直前に置く。  
6. **キャラ対話**: [html-character-dialogue.md](html-character-dialogue.md) に従い **`id="iyt-character-dialogue"`** を必ず入れる（**`iyt-my-strategy` より上**）。台本ルールは [character-usage.md](character-usage.md)・[dialogue-generation-youtube.md](dialogue-generation-youtube.md)。  
7. **deep 追加**: `index.html`（compact）とは別に **`deep.html`** を生成する。deep は [html-deep-template.md](html-deep-template.md) に従い、**チャンネル順の動画カード**を主役にし、**1動画あたり引用2〜3**（`<span data-iyt-quote="1">`＋`t=`リンク）を付ける。引用できない（`description_only` / `summary_only`）動画は **掲載縮小＋判断保留**に倒す。  
8. 実装のばらつきを避けるため、HTML生成の指示文は [phase7-html-generation-prompt.md](phase7-html-generation-prompt.md) の **コピペ正本**を使う（断片プロンプトの増殖を禁止）。  
9. 長大化する場合のみ `html-long-fallback.md` を検討し、内部メモに理由を1 行。

### S10 品質ゲート

- `quality-checklist.md`。

## SKILL.md フェーズ対応（参照用）

| 内部ステップ | SKILL Phase |
|--------------|-------------|
| S1〜S2 | 0〜1 |
| S3〜S4 | 2 |
| S4b | 3（凍結） |
| S5〜S6 | 4 |
| S7 | 5 |
| S8 | 6 |
| S9 | 7 |
| レビュー以降 | 8〜10 |

## diagram-invest との作業分担メモ

- diagram-invest の Phase 番号と **一致させる必要はない**。本ファイルの S1〜S10 が手順の正本。
