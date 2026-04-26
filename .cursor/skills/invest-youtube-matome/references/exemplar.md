# compact 成功パターン（模範・読み順）

**目的**: 生成 HTML が「表だらけで読めない」状態にならないよう、**diagram-maji 型の視線のレール**を固定する。実データは差し替え、**構造とクラス名は維持**する。

正本: [html-structure.md](html-structure.md)（CSS・レイヤー）／キャラ対話: [html-character-dialogue.md](html-character-dialogue.md)／ルール: [html-compact-template.md](html-compact-template.md)／**会話・口調の正本入口**: [diagram-invest-character-bridge.md](diagram-invest-character-bridge.md)

本スキルは `index.html`（compact）に加えて **`deep.html`（深掘り）**も生成する。deep の契約は [html-deep-template.md](html-deep-template.md)。

---

## 読み順（上から）

1. **ヘッダ**（`iyt-header-gradient`）— 日付 JST、`h1`、**動画窓 2d/7d**、ニュース鮮度の一言  
2. **`id="iyt-executive"`** — 2 行要約（揉めどころ／まず見るクラスタ）。`.section-card`  
3. **`id="iyt-read-path"`** — **まず読む3つ**（番号付きカード）。表より必ず上  
4. **市場体温ミニ** — 薄い `.section-card` または executive 内 `details`  
5. **`id="iyt-dual-signal"`** — 二重信号機 1 行以上  
6. **クラスタ A の比較** — `.section-card` ＋ 見出し（Lucide）＋ **スマホはカード／md 以上で表**  
7. **クラスタ B…** — 同型を繰り返し  
8. **代表2主張 + ラベル**（`前提ズレ` / `本音の対立`）— `.section-card`  
9. **裏取りストリップ** — クラスタごと `.section-card`  
10. **X / トレンド（任意）** — 短い `.section-card`  
11. **`id="iyt-character-dialogue"`（必須）** — ヒロ子＋イチさんの**短い**解説（**My Strategy より上**）。マークアップは [html-character-dialogue.md](html-character-dialogue.md)  
12. **`id="iyt-my-strategy"`** — 非保存・ヒント 3 行まで  
13. **免責** — `legal-disclaimer.md`  
14. **フッター** — 動画リンク集  

**目次（任意）**: `nav.toc-float.section-card` でアンカー一覧。デスクトップのみ表示でよい（`html-structure.md` の `.toc-float`）。

---

## キャラ画像・吹き出し（品質ゲート上は必須に近い）

diagram-invest 同型の **左右固定アバター＋吹き出し**は [character-avatars-compact.md](character-avatars-compact.md) を正本とする。**本番 HTML の `img` は PNG**（`docs/avatars` を `assets/characters/` にコピー）。CSS は **`#iyt-character-dialogue` 配下**にスコープし、必須の `<section id="iyt-character-dialogue">` は変えない。下のワイヤは **画像なし最小**の例（骨格確認用）。

## ワイヤHTML（骨格のみ・コピー用）

`{TITLE}` `{SUB}` `{DOMAIN}` は置換。YouTube URL は実データに差し替え。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{TITLE} - 投資YouTubeまとめ</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    :root {
      --iyt-navy: #0f172a;
      --iyt-navy-mid: #1e3a5f;
      --iyt-gold: #854d0e;
    }
    body { font-family: 'Noto Sans JP', 'Inter', system-ui, sans-serif; }
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
      position: fixed; top: 6rem; right: 1rem; width: 13rem; z-index: 40; display: none;
    }
    @media (min-width: 1100px) { .toc-float { display: block; } }
  </style>
</head>
<body class="bg-slate-50 pb-24">
  <header class="iyt-header-gradient text-white px-4 py-10">
    <div class="max-w-3xl mx-auto">
      <p class="text-sm opacity-90 mb-2">作成: 2026-04-24 JST</p>
      <h1 class="text-2xl md:text-3xl font-bold leading-tight">{TITLE}</h1>
      <p class="mt-3 text-sm md:text-base opacity-95">{SUB}（対象動画: 直近2日・JST / ニュース: 直近24時間中心）</p>
    </div>
  </header>

  <nav class="toc-float section-card text-sm" aria-label="ページ内目次">
    <div class="font-bold text-slate-800 mb-2 flex items-center gap-1">
      <i data-lucide="list" class="w-4 h-4"></i> 目次
    </div>
    <ul class="space-y-1 text-blue-800">
      <li><a href="#iyt-executive" class="hover:underline">要約</a></li>
      <li><a href="#iyt-read-path" class="hover:underline">まず読む3つ</a></li>
      <li><a href="#iyt-dual-signal" class="hover:underline">二重信号</a></li>
      <li><a href="#cluster-c1" class="hover:underline">クラスタ例</a></li>
      <li><a href="#iyt-character-dialogue" class="hover:underline">ひとこと解説</a></li>
      <li><a href="#iyt-my-strategy" class="hover:underline">My Strategy</a></li>
    </ul>
  </nav>

  <main class="max-w-3xl mx-auto px-4 -mt-6 relative z-10">
    <section class="section-card" id="iyt-executive">
      <h2 class="text-lg font-bold text-slate-800 mb-2">いまいちばん揉めていること</h2>
      <p class="text-slate-700">（1行目）金利ピークアウト期待とハイテク割高感のせめぎ合い。</p>
      <p class="text-slate-700">（2行目）まずは「米金利クラスタ」の表と裏取りから見ると迷子になりにくい。</p>
    </section>

    <section class="section-card" id="iyt-read-path">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-600 to-amber-400">
          <i data-lucide="list-tree" class="w-6 h-6 text-white"></i>
        </div>
        <div>
          <h2 class="text-2xl font-bold text-slate-800">まず読む3つ</h2>
          <p class="text-slate-500 text-sm">表に入る前のレール</p>
        </div>
      </div>
      <div class="grid gap-4">
        <div class="flex items-start gap-4 p-4 rounded-xl border-l-4 border-amber-500 bg-amber-50">
          <div class="w-10 h-10 bg-amber-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
          <p class="text-slate-700 text-sm">（要点1：読者が持ち帰る一行）</p>
        </div>
        <div class="flex items-start gap-4 p-4 rounded-xl border-l-4 border-slate-400 bg-slate-50">
          <div class="w-10 h-10 bg-slate-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
          <p class="text-slate-700 text-sm">（要点2）</p>
        </div>
        <div class="flex items-start gap-4 p-4 rounded-xl border-l-4 border-slate-400 bg-slate-50">
          <div class="w-10 h-10 bg-slate-600 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">3</div>
          <p class="text-slate-700 text-sm">（要点3）</p>
        </div>
      </div>
    </section>

    <section class="section-card">
      <p class="text-sm text-slate-600">市場体温ミニ（1〜2行・断定しない）</p>
    </section>

    <section class="section-card" id="iyt-dual-signal">
      <h2 class="text-lg font-bold text-slate-800 mb-2">二重信号機</h2>
      <p class="text-slate-700 text-sm">（1行以上。visual-signal.md に従う）</p>
    </section>

    <section class="section-card" id="cluster-c1">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
          <i data-lucide="table-2" class="w-5 h-5 text-slate-700"></i>
        </div>
        <h2 class="text-xl font-bold text-slate-800">クラスタ: 米金利とハイテク（例）</h2>
      </div>
      <p class="text-xs text-slate-500 mb-3 md:hidden">スマホ: 下のカードを横にスクロールせず縦に読む。</p>
      <div class="md:hidden space-y-3">
        <div class="rounded-lg border border-slate-200 p-3 text-sm">
          <p class="font-bold text-slate-800">@chA</p>
          <p class="text-slate-600 mt-1">主張一行…</p>
          <a class="text-blue-700 underline text-xs mt-2 inline-block" href="https://www.youtube.com/watch?v=VIDEO_ID_A">動画</a>
        </div>
        <div class="rounded-lg border border-slate-200 p-3 text-sm">
          <p class="font-bold text-slate-800">@chB</p>
          <p class="text-slate-600 mt-1">主張一行…</p>
          <a class="text-blue-700 underline text-xs mt-2 inline-block" href="https://www.youtube.com/watch?v=VIDEO_ID_B">動画</a>
        </div>
      </div>
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full text-sm border-collapse">
          <caption class="text-left text-slate-600 mb-2">比較（例）</caption>
          <thead><tr class="bg-slate-100"><th scope="col" class="p-2 text-left">列</th></tr></thead>
          <tbody><tr><td class="p-2 border-t">セル（実データ）</td></tr></tbody>
        </table>
      </div>
    </section>

    <section class="section-card">
      <h2 class="text-lg font-bold text-slate-800 mb-2">代表2主張とラベル</h2>
      <p class="text-sm text-slate-700"><span class="font-semibold">前提ズレ</span> … / <span class="font-semibold">本音の対立</span> …</p>
    </section>

    <section class="section-card" id="iyt-character-dialogue" aria-label="ヒロ子とイチさんの短い解説">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-lg bg-pink-100 flex items-center justify-center">
          <i data-lucide="messages-square" class="w-5 h-5 text-pink-700"></i>
        </div>
        <h2 class="text-xl font-bold text-slate-800">ひとこと解説</h2>
      </div>
      <div class="space-y-4 text-sm md:text-base">
        <div class="rounded-xl border border-pink-200 bg-gradient-to-br from-pink-50 to-rose-50 p-4">
          <p class="text-slate-800 leading-relaxed">
            <span class="font-bold text-pink-700">ヒロ子:</span>
            え、でもさ、表だけだとどこから見ればいいの？あたし、金利の話とハイテクの話がごっちゃになりそうじゃん。
          </p>
        </div>
        <div class="rounded-xl border border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 p-4">
          <p class="text-slate-800 leading-relaxed">
            <span class="font-bold text-slate-800">イチさん:</span>
            ワシらがまず見るべきは勢いだけではない。いまの論点は「米金利クラスタ」の表と、その直下の裏取りじゃ。
          </p>
        </div>
      </div>
    </section>

    <section class="section-card" id="iyt-my-strategy" aria-label="自分の出口戦略メモ（保存されません）">
      <h2 class="text-lg font-bold text-slate-800">My Strategy</h2>
      <p class="text-sm text-slate-600 mt-2">この欄に入力した内容は保存されません。</p>
      <ul class="mt-2 text-sm text-slate-600 list-disc list-inside">
        <li>利確条件</li>
        <li>損切り条件</li>
        <li>様子見条件</li>
      </ul>
    </section>

    <section class="section-card text-sm text-slate-700">
      <p>本ページは情報整理です。投資は自己責任であり、投資助言ではありません。</p>
    </section>
  </main>
  <script>lucide.createIcons();</script>
</body>
</html>
```

---

## アンチパターン（避ける）

- `iyt-read-path` なしで **いきなり巨大 `<table>`**  
- **`id="iyt-character-dialogue"` を省略**する、または **My Strategy より下**に置く  
- キャラ対話に **ヒロ子／イチさん（またはイチさん側の「ワシ」）のラベルが無い**  
- `.section-card` なしで `h2` だけが連続  
- チャンネル列が多いのに **スマホでも表のみ**（横スクロール地獄）  
- Lucide を読み込んだまま **`createIcons()` を呼ばない**  

---

## チェック

生成後は `node scripts/check_invest_youtube_matome.mjs --file index.html` を実行する（`[FAIL]` が **`iyt-character-dialogue`** なら [html-character-dialogue.md](html-character-dialogue.md) を開き、WARN に構造系が出たら [html-structure.md](html-structure.md) に寄せて再生成）。
