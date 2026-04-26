# Phase 7: HTML 生成プロンプト（正本・コピペ用）

## 目的

Phase 3 の凍結成果（`clusters[]` / `claim_cards[]`）と、Phase 4〜6 の要約・裏取りを使って、同一フォルダに次の **2ファイル**を生成する。

- `index.html`（compact）: 既存の比較体験（短時間で俯瞰）を壊さない
- `deep.html`（深掘り）: YouTube 発言（タイムスタンプ引用）に寄せて **中身感を最大化**

**このプロンプトは「生成指示の正本（SSOT）」**。プロンプト断片をチャットごとに増やしてパッチワーク化しない。

## 前提（必ず守る）

- Phase 3 凍結 JSON は **改変禁止**（誤り修正のみ）。足りない説明は HTML 文章側で補う。
- `index.html` は [html-structure.md](html-structure.md) / [exemplar.md](exemplar.md) / [html-compact-template.md](html-compact-template.md) を満たす。
- `deep.html` は [html-deep-template.md](html-deep-template.md) を満たす。
- 引用は必ず `<span data-iyt-quote="1">…</span>`（平文のみ・ネスト禁止）。引用元へは `t=` 付きリンクで飛ばす。
- `description_only` / `summary_only` は deep では **掲載縮小＋判断保留**（捏造禁止）。
- 投資助言・売買断定は禁止。免責は必須（`legal-disclaimer.md`）。

---

## 入力として渡すもの（コピペ枠）

以下を 1 つのメッセージでモデルに渡す（順番維持）。

1. `{AS_OF_JST}`（例: `2026-04-25 JST`）
2. `{VIDEO_WINDOW}`（`2d` or `7d`）
3. `{NEWS_WINDOW}`（例: `直近数日`）
4. `{PUBLIC_DOMAIN}`（Surge のドメイン。例: `https://invest-youtube-matome-20260425.surge.sh/`）
5. `{FROZEN_JSON}`（Phase 3 凍結 JSON。`clusters-output-schema.md` 準拠）
6. `{REPRESENTATIVE_PAIRS}`（Phase 4 の代表2主張＋ラベル。クラスタごと）
7. `{VERIFY_STRIP_ITEMS}`（Phase 5 の裏取りストリップ項目）
8. `{MARKET_SNAPSHOT_MINI}`（Phase 6 の市場体温ミニ 1〜2行）
9. `{CHARACTER_DIALOGUE_HTML}`（compact 用。`html-character-dialogue.md` のマークアップをそのまま）

`{CHARACTER_DIALOGUE_HTML}` は `index.html` にだけ入れる（deep は引用主役のため必須ではない）。

---

## 生成プロンプト（貼り付けて使う）

次のブロックをそのまま貼り、`{...}` を置換する。

```text
あなたはプロの編集者兼エンジニアです。以下の凍結JSON（Phase3）と補助情報から、同一フォルダに配置される 2つのHTMLファイルの中身を生成してください。

出力は「index.html の全文」→区切り線→「deep.html の全文」の順で、HTML以外の文章は出さないでください。

共通要件:
- Tailwind CDN + Lucide を使う。配色はネイビー×ゴールド。`<main class="max-w-3xl ...">` と `.section-card` を使い、スマホ最優先の縦読みを崩さない。
- 免責は必須。「投資は自己責任」「投資助言ではない」を含める。
- YouTube 発言の短い引用は `<span data-iyt-quote="1">...</span>` で包む（平文のみ・ネスト禁止）。
- `youtube.com/watch?v=` または `youtu.be/` のリンクを必ず含める。

index.html (compact) 要件:
- 参照: html-structure.md / exemplar.md / html-compact-template.md を満たす。
- 必須id: iyt-read-path, iyt-executive, iyt-dual-signal, iyt-character-dialogue, iyt-my-strategy。
- 既存の “比較マトリクス” 体験を主役にし、deepへのリンク（deep.html）を 1つ入れる。
- キャラ対話は下記の `{CHARACTER_DIALOGUE_HTML}` をそのまま挿入する（My Strategyより上）。

deep.html (深掘り) 要件:
- 参照: html-deep-template.md を満たす。
- 必須id: iyt-deep-header, iyt-deep-channel-cards, iyt-deep-clusters, iyt-deep-verify-map, iyt-deep-footer。
- deepは「チャンネル順の動画カード」を主役にする。
  - 1動画あたり引用 2〜3 個（短い原文 + t=リンク）。
  - evidence_grade が description_only / summary_only の動画は掲載縮小し、主張は弱め／判断保留寄りにする（捏造禁止）。
- クラスタ別セクションでは、代表2主張（A/B）を “証拠つきディベート” として再掲する（各サイド引用1個＋t=リンク）。
- deepのヘッダ付近に index.html へ戻るリンクを置く。

入力:
AS_OF: {AS_OF_JST}
VIDEO_WINDOW: {VIDEO_WINDOW}
NEWS_WINDOW: {NEWS_WINDOW}
PUBLIC_DOMAIN: {PUBLIC_DOMAIN}

FROZEN_JSON:
{FROZEN_JSON}

REPRESENTATIVE_PAIRS:
{REPRESENTATIVE_PAIRS}

VERIFY_STRIP_ITEMS:
{VERIFY_STRIP_ITEMS}

MARKET_SNAPSHOT_MINI:
{MARKET_SNAPSHOT_MINI}

CHARACTER_DIALOGUE_HTML (for index.html only):
{CHARACTER_DIALOGUE_HTML}

注意:
- 凍結JSONは改変しない。本文の説明で補う。
- 断定の売買表現は禁止。
- 可能なら各カード/セルに published_at と evidence_grade の短い注記を入れる。
```

---

## 生成後チェック（必須）

生成した2ファイルそれぞれに機械チェックを通す。

```bash
node scripts/check_invest_youtube_matome.mjs --file index.html --mode compact
node scripts/check_invest_youtube_matome.mjs --file deep.html --mode deep
```

