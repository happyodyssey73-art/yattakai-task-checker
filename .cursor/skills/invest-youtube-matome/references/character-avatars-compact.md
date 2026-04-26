# compact 用キャラアバター（invest-youtube-matome 正本）

## 目的

`#iyt-character-dialogue` で **diagram-invest と同じ読み方（左右固定・吹き出し）** を再現しつつ、**必須 `id`・`<section>` 形式**（[html-character-dialogue.md](html-character-dialogue.md)）を壊さない。

## 正本の階層（二重定義しない）

| 論点 | 参照 |
|------|------|
| 人物像・口調・会話プロトコル（L1/L2/L3・§0b・§1b・§2b） | diagram-invest の `dialogue-generation.md`・`character-voice.md`（入口は [diagram-invest-character-bridge.md](diagram-invest-character-bridge.md)） |
| 表情の意味・時間軸（happy / greed / confused 等）・`alt` の型 | diagram-invest の `character-avatars.md` |
| invest-youtube 内の索引 | [character-usage.md](character-usage.md) |
| DOM・配置・分量 | [html-character-dialogue.md](html-character-dialogue.md) |

## 画像の正本（リポジトリ内）

1. **共通バンク（編集・増量の単一置き場）**: リポジトリ直下の **`docs/avatars/*.png`**（一覧・運用は `docs/avatars/README.md`）。  
2. **公開単位（Surge に乗せる実体）**: `docs/{ドメイン名}/assets/characters/` に、当該ページで使う表情だけ **コピー**。`surge` はフォルダ単位のため **HTML と同じツリーに必ず同梱**。  
3. **HTML の `src`**: **PNG を既定**（例: `assets/characters/hiroko-confused.png`）。オフライン用・軽量代替として **SVG を同梱してもよい**が、本番表示は **PNG 優先**とする。

## デプロイ先のディレクトリ規約

```
docs/{ドメイン名}/
  index.html
  assets/characters/
    README.md          … 運用メモ（任意だが推奨）
    hiroko-*.png       … docs/avatars からコピー（本番用）
    ichisan-*.png      … 同上
    *.svg              … 任意のベクター代替（PNG 未コピー時の退避用）
```

詳細は [deploy-and-url.md](deploy-and-url.md)。

## HTML 構造（diagram-invest 準拠・クラス名は `iyt-` で名前空間）

- **ヒロ子行**: アバター **左**（`.iyt-chat-row--hiro`）
- **イチさん行**: アバター **右**（`.iyt-chat-row--master` → `flex-direction: row-reverse`）
- **吹き出し**: `.iyt-bubble--hiro` / `.iyt-bubble--master`（尖端はアバター側の `::before` で付与）
- **セクション**: ルートは **1 つの** `<section class="section-card …" id="iyt-character-dialogue">` のまま（機械チェック互換）。CSS は **`#iyt-character-dialogue` 配下**にスコープし、追加クラス名の表記ゆれを避ける。

## 画像 `src` と `alt`

- `src` は **相対パス**（例: `assets/characters/hiroko-confused.png`）を推奨。
- `alt` は **「キャラ名（感情・このブロックの文脈）」** まで書く（diagram-invest の `character-avatars.md` と同型）。
- `width` / `height` を指定し CLS を抑える。`loading="lazy"` 可（折りたたみ下）。

## 表情の選び方（compact 用の目安）

| 場面 | ヒロ子 | イチさん |
|------|--------|----------|
| 表の見方が混乱・前提ズレの噛み砕き | `hiroko-confused` | `ichisan-serious` |
| 楽観シナリオの紹介 | `hiroko-euphoria` または `hiroko-greed` | `ichisan-surprised` など |
| 注意喚起 | `hiroko-surprise` | `ichisan-angry` |

迷ったら **confused + serious** で「読者の混乱 → 師匠が物差し」を出す。ファイル名の最終決定は **バンク側の実ファイル**に合わせる（`hiroko-zetubou` / `hiroko-zetsubou` の表記ゆれに注意）。

## diagram-invest の `images/` との関係

グローバルに diagram-invest リポジトリを持つ場合、`docs/avatars` と **同一命名の PNG** が並ぶ想定。どちらからコピーしてもよいが、**yattakai-task-checker では `docs/avatars` をバンク**とする。
