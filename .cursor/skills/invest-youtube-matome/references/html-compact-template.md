# compact HTML（ルール集・正本の一部）

**レイアウトの骨格・CSS・読み順の模範**は次に分離した。**本文生成時は必ず併読**すること。

| 正本 | 役割 |
|------|------|
| [html-structure.md](html-structure.md) | `<head>` 共通、`body` レイヤー、`.section-card`、ヘッダー／`<main>`、必須 `id` の**置き場** |
| [html-character-dialogue.md](html-character-dialogue.md) | **ヒロ子・イチさん**の必須短対話（`id`・マークアップ・分量） |
| [character-avatars-compact.md](character-avatars-compact.md) | アバター画像・`.iyt-chat-row` 吹き出し（任意・diagram-invest 同型） |
| [exemplar.md](exemplar.md) | **読み順**とワイヤ HTML（上記を含む **1 本の模範**） |

本ファイルは **意味ルール・機械チェック・引用・表の中身** に限定する。

## index.html / deep.html の二枚構成（必須）

本スキルは毎回、次の **2ファイル**を生成する（デプロイ単位は同一フォルダ配下）。

- `index.html`（compact）: 本ファイルのルール対象
- `deep.html`（深掘り）: [html-deep-template.md](html-deep-template.md) のルール対象

`index.html` 側に **deep への導線**を 1 つ置く（例: `deep.html` へのリンク）。deep 側にも **index へ戻るリンク**をヘッダ付近に置く。

## 技術スタック

- **Tailwind CSS CDN**、**Lucide**（絵文字禁止）。配色は **ネイビー × ゴールド**（`html-structure.md` のトークン）。  
- **スマホ最優先**。マトリクスは **スマホではカードスタック、`md:` 以上で表**を推奨（`exemplar.md` 参照）。横スクロールのみは最終手段。

## 必須 DOM id（機械チェック）

| id | 内容 |
|----|------|
| `iyt-read-path` | **まず読む3つ**（表より上）。今日のレール。 |
| `iyt-executive` | Executive strip（最重要クラスタ要約・**2 行**） |
| `iyt-dual-signal` | 二重信号機（`visual-signal.md`） |
| `iyt-character-dialogue` | **ヒロ子＋イチさん**の短い解説（**`iyt-my-strategy` より上**）。正本 [html-character-dialogue.md](html-character-dialogue.md)。 |
| `iyt-my-strategy` | My Strategy ブロック |

## セクション順（論理・上から）

`exemplar.md` の番号と一致させる。省略するのは **X / トレンドのみ**可。キャラ対話は **省略不可**。

1. ヘッダ（JST、窓、鮮度）  
2. `iyt-executive`（2 行）  
3. `iyt-read-path`（3 点）  
4. 市場体温ミニ（薄い）  
5. `iyt-dual-signal`  
6. クラスタごとの比較（**各クラスタを `.section-card` で包む**）  
7. 代表2主張 + `前提ズレ` / `本音の対立`  
8. 裏取りストリップ（日本語ラベル主）  
9. X / トレンド（**任意**）  
10. **`iyt-character-dialogue`**（**必須**・短いキャラ対話。口調は [character-usage.md](character-usage.md)・[dialogue-generation-youtube.md](dialogue-generation-youtube.md)）  
11. `iyt-my-strategy`  
12. 免責・フッター  

## レイアウト必須（人間可読性）

- **`<main class="max-w-3xl …">`（または max-w-4xl）** で本文を囲む。  
- **主要ブロックは `.section-card`**（`html-structure.md` の定義）。  
- ページ末尾で **`lucide.createIcons();`** を実行する。

## 引用ラッパ（必須）

YouTube 発言の短い引用は **平文のみ** を次で包む（ネスト禁止）:

```html
<span data-iyt-quote="1">（発言の原文または忠実な短い引用）</span>
```

deep.html でも同じ引用ラッパを使う（`html-deep-template.md`）。

## 開発用ブロックの禁止

- `<aside class="iyt-devonly">` は **制作メモ専用**。公開 HTML に **残さない**。

## マトリクス表のルール

- 非表示 ch は **列／カードを出さない**  
- 各セル（またはカード）に **動画公開日時** と **evidence_grade** の短い注記（自動字幕ならその旨）

## OGP

- `og:title` / `og:description` / `og:url` を揃える。`title` / `h1` と主題一致。

## アクセシビリティ

- 表は `scope` または `caption` で対応が分かるようにする。色だけに依存しない。

## 裏取りストリップ（最後に1回だけキャラで落とす）

裏取りストリップは事実が続くので、読み終わりに **最後の落ちを1回だけ**置く（diagram-invest の会話プロトコル: `dialogue-generation.md` を踏む）。

- **やること**: `#iyt-verify` の `</ul>` の直後に、短い **ヒロ子 → イチさん**（各 1〜2 文）を置き、裏取り全体の要点を **「箱（レッグ）を決める」** に収束させる。  
- **誘導（利用予約）**: 会話内で `#iyt-diagram` / `#cluster-fed` / `#iyt-two-claims` などへ **アンカーリンク**し、読者の再読順を示してよい。  
- **禁止**: 裏取り `li` ごとに会話を挿入して冗長にしない／章末に別の“トピック集”を置いて流れを切断しない。  
- **画像**: 使う場合は **`assets/characters/` に同梱済みの表情のみ**（欠落させない）。

## 要所のキャラまとめ（最大2回まで）

ページの背骨を作るために、キャラ会話は増やしすぎない。**同じ部品（`iyt-chat-row`）で、要所だけ2回まで**に統一する。

- **推奨1**: `#iyt-diagram`（図解）の直後に 1 回（「箱＝レッグを決める」を一言で落とす）。  
- **推奨2**: `#iyt-two-claims`（代表2主張とラベル）の直後に 1 回（「前提ズレ／本音の対立＝物差しの違い」を落とし、`#iyt-verify` に繋ぐ）。  
- **禁止**: 章末に“トピック集”を増殖させて流れを切断しない（パッチワーク化する）。
