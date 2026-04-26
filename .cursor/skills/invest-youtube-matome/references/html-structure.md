# compact HTML 骨格（正本）

**diagram-maji**（`html-structure.md` + セクションカード）と同型の **読みレール** を、投資 YouTube まとめ用に **ネイビー × ゴールド** で定義する。生成時は **このファイルの DOM/CSS パターンを踏襲**し、本文の事実・表の中身は `html-compact-template.md`・各 Reference に従う。

## 参照の役割分担

| ファイル | 役割 |
|----------|------|
| **本ファイル** | `<head>` 共通、`body` のレイヤー、`.section-card`、ヘッダー／`<main>`／目次、**必須 `id` の置き場** |
| [exemplar.md](exemplar.md) | **読み順**と「まず読む3つ」～マトリクス～**キャラ対話**までの **模範ワイヤ** |
| [html-character-dialogue.md](html-character-dialogue.md) | **ヒロ子・イチさん**の必須短対話（`id`・配置・最低マークアップ） |
| [html-compact-template.md](html-compact-template.md) | 必須 id の意味、引用ラッパ、表セルルール、OGP・a11y の**ルール集**（レイアウトの重複は本ファイル優先） |

## 技術スタック（固定）

- **Tailwind CSS CDN**、**Lucide**（`data-lucide`）。絵文字は使わない。  
- フォント: `Noto Sans JP` + `Inter`（下記 `<link>` と同一）。  
- ページ末尾で必ず **`lucide.createIcons();`** を実行する。

## 必須 `id`（機械チェック）

| id | 置き場所の目安 |
|----|----------------|
| `iyt-read-path` | **マトリクスより上**。今日つかむ **3 点**（見出し＋3 行／3 カード）。diagram-maji の「まず覚える3つ」に相当。 |
| `iyt-executive` | ヘッダ直下〜`iyt-read-path` の近傍。**2 行**で「いちばん揉めている／見るべきクラスタ」。 |
| `iyt-dual-signal` | 市場体温ミニの近く。二重信号機（`visual-signal.md`）。 |
| `iyt-my-strategy` | 免責の直前付近。非保存・`aria-label`・`html-compact-template.md` 準拠。 |
| `iyt-character-dialogue` | **`iyt-my-strategy` より上**。裏取り（および任意の X）の直後推奨。詳細は [html-character-dialogue.md](html-character-dialogue.md)。 |

## ページレイヤー（必須構造）

```
body.bg-slate-50（または同等の薄い背景）
├── header（フル幅・ネイビー〜ゴールドのグラデーション、h1・窓・鮮度の一言）
├── nav.toc-float（任意・デスクトップのみ表示可。diagram-maji と同様 max-width で非表示切替）
└── main.max-w-3xl または max-w-4xl mx-auto px-4 py-8
      └── 各論理ブロックは .section-card で包む（下記）
```

- **`<main>` を必ず使う**（スクリーンリーダー・スタイルの基準点）。  
- **主要ブロックはすべて `.section-card`**（白背景・角丸・影・`margin-bottom`）。裸の `<section>` だけにしない。

## 共通 CSS（`<style>` 内にコピー可）

以下は **そのまま貼り付けてよい** 最小セット。プロジェクトで既に同名クラスがある場合は統合する。

```html
<style>
  :root {
    --iyt-navy: #0f172a;
    --iyt-navy-mid: #1e3a5f;
    --iyt-gold: #854d0e;
    --iyt-gold-soft: #c9a227;
  }
  body {
    font-family: 'Noto Sans JP', 'Inter', system-ui, sans-serif;
  }
  .iyt-header-gradient {
    background: linear-gradient(135deg, var(--iyt-navy) 0%, var(--iyt-navy-mid) 45%, var(--iyt-gold) 100%);
  }
  .section-card {
    background: #fff;
    border-radius: 1rem;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
    border: 1px solid #e2e8f0;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .toc-float {
    position: fixed;
    top: 6rem;
    right: 1rem;
    width: 13rem;
    z-index: 40;
    display: none;
  }
  @media (min-width: 1100px) {
    .toc-float { display: block; }
  }
</style>
```

`<head>` 先頭付近:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/lucide@latest"></script>
```

## セクション見出しの型（推奨）

diagram-maji の「アイコン＋ h2」を **各 `.section-card` の先頭**に置く。

```html
<div class="section-card" id="iyt-read-path">
  <div class="flex items-center gap-3 mb-6">
    <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-600 to-amber-400">
      <i data-lucide="list-tree" class="w-6 h-6 text-white"></i>
    </div>
    <div>
      <h2 class="text-2xl font-bold text-slate-800">まず読む3つ（今日のレール）</h2>
      <p class="text-slate-500 text-sm">表に入る前にここだけ</p>
    </div>
  </div>
  <!-- 3 つの行／カード（番号付き） -->
</div>
```

## マトリクス（主役）の包み方

- **クラスタごとに 1 つの `.section-card`**。見出しにクラスタ名＋Lucide（例 `table-2`）。  
- **スマホ既定**: チャンネル列が多いときは **`md:` 未満ではカードスタック**（1 ch = 1 カード）、`md:` 以上で `<table>` を出す **二段レイアウト**を推奨。  
- 横スクロールのみの表は **最終手段**（`overflow-x-auto`）。  

## フッター前

```html
<script>
  lucide.createIcons();
</script>
```

## OGP

`og:title` / `og:description` / `og:url` は [html-compact-template.md](html-compact-template.md) に従い、**デプロイ後 URL** と一致させる。

## アクセシビリティ

- 表: `caption` または `scope` で対応関係を明示。  
- 色だけに依存しない（バッジに短いテキストラベルを併記）。
