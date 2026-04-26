# ヒロ子・イチさん対話ブロック（compact 必須・HTML 正本）

**役割**: 表と裏取りだけでは硬いページに **短いキャラ対話**を必ず入れ、読者が「なぜそれが揉めているか」を**口語で一度噛める**ようにする。

**口調・L1/L2/L3・朗読・転写禁止の正本**は diagram-invest（`dialogue-generation.md`・`character-voice.md`）。invest-youtube 側では次を **この順で必読**とする（省略不可）。

1. [diagram-invest-character-bridge.md](diagram-invest-character-bridge.md)  
2. [character-usage.md](character-usage.md)（索引）  
3. [dialogue-generation-youtube.md](dialogue-generation-youtube.md)（YouTube 固有の上書き）  

**本ファイルはマークアップ・配置・最低分量・画像 `src` の型**のみを定義する（SKILL.md では要件を宣言し、詳細はここに集約する）。

## 必須

- **`id="iyt-character-dialogue"`** を付けた **1 つの `<section class="section-card">`**。機械チェックの錨。**`check_invest_youtube_matome.mjs` は `<section … id="iyt-character-dialogue">` 形式のみ検出**するため、この形を用いる（`div` ラッパーは未対応）。  
- **配置**: **`id="iyt-my-strategy"` より必ず上**。推奨は **裏取りストリップの直後**（X/トレンドを挟む場合はその直後）。  
- **最低ライン（分量）**:  
  - **ヒロ子**: 読者の素朴な疑問・勢いを **1 吹き出し（2〜4 文まで）**。  
  - **イチさん**: 体温・歴史・注意点を **1 吹き出し（2〜4 文まで）**。  
- **本文に明示ラベル**: 読者が誰の声か分かるよう、**「ヒロ子:」「イチさん:」**（または同義の `span` 見出し）を **各吹き出し先頭**に付ける。イチさんの一人称 **「ワシ」**を本文で使う場合もよいが、その場合でも **「イチさん:」ラベルはどちらかの吹き出しに必ず一度は出す**（チェッカー互換）。

## 推奨マークアップ（コピー可）

**本番は PNG 既定**（`docs/avatars` から `assets/characters/` へコピー）。画像が無い退避のみ **テキスト＋枠**または SVG 代替。配置・ファイル名は **[character-avatars-compact.md](character-avatars-compact.md)**。

### 画像ありレイアウト（diagram-invest 同型・推奨）

左右固定の **`.iyt-chat-row`** と吹き出し **`.iyt-bubble--hiro` / `.iyt-bubble--master`**、デプロイ先の `assets/characters/` 規約は **[character-avatars-compact.md](character-avatars-compact.md)** を正本とする。  
`#iyt-character-dialogue` は **`<section>` のまま**とし、CSS は **`#iyt-character-dialogue` 配下**にスコープする（`check_invest_youtube_matome.mjs` 互換）。

**`img` の例（本番）**: `src="assets/characters/hiroko-confused.png"` / `src="assets/characters/ichisan-serious.png"`（実在ファイル名に合わせる）。

### 会話UIの再利用（本質）

`iyt-chat-row` / `iyt-avatar` / `iyt-bubble` を **複数セクションで使う**場合、CSS のスコープは `#iyt-character-dialogue` ではなく、親の **`.iyt-chat-surface`** で統一する（再利用の正道）。  
`check_invest_youtube_matome.mjs` は **`.iyt-chat-row` が `.iyt-chat-surface` の外に出たら WARN** する。

```html
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
        （読者の素朴な疑問・FOMO を 2〜4 文。主張の出典動画を 1 文で手前に置いてから感情へ。）
      </p>
    </div>
    <div class="rounded-xl border border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <p class="text-slate-800 leading-relaxed">
        <span class="font-bold text-slate-800">イチさん:</span>
        （です・ます禁止。ワシ／〜じゃ。体温・歴史・注意を 2〜4 文。）
      </p>
    </div>
  </div>
</section>
```

## 禁止・注意（dialogue-generation と重複するが要約）

- **進行役・司会**（「では次に」等）は禁止。  
- **内部ラベル**（三角、メモ番号）をセリフに写さない。  
- **他チャンネル人格攻撃**は禁止。ズレは **前提ズレ / 本音の対立** の語彙へ。  
- **個別株**はセリフでも **引用・例示**に限定。エージェントの「いま買え」は禁止。

## long モード

`html-long-fallback.md` に従い対話を増やしてよいが、**`id="iyt-character-dialogue"` の compact 用 `<section>` は残す**（先に短い「入口」を置き、長い対話は **別の `section`（別 id）** に分けると読みやすい。補助スクリプトは `iyt-character-dialogue` を 1 か所だけ検査する）。
