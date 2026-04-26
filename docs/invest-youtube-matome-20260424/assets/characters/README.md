# キャラクター画像（invest-youtube-matome デプロイ用）

## 目的

`index.html` の `#iyt-character-dialogue` で **ヒロ子・イチさん**を視覚的に区別する。  
正本の表情一覧・HTML/CSS 型は **diagram-invest** スキル内 `references/character-avatars.md` を参照（例: `%USERPROFILE%\.cursor\skills\diagram-invest\references\character-avatars.md`）。

## このフォルダのルール

| 優先 | ファイル | 用途 |
|------|----------|------|
| 1 | `hiroko-*.png` / `ichisan-*.png` | diagram-invest と**同一ファイル名**で配置すると、`src` を `.svg` から差し替えるだけで本番寄りになる。 |
| 2 | `*.svg`（同梱） | PNG が未コピーでもレイアウト・比率が崩れない**ベクター代替**。 |

## PNG を使う手順（推奨・本番品質）

1. diagram-invest の `references/images/` から、必要な表情だけコピー（compact は通常 **hiroko-confused** / **ichisan-serious** など 2 枚で足りることが多い）。
2. 本ディレクトリに置く（`hiroko-confused.png` 等）。
3. `index.html` 内の `<img src="assets/characters/...">` を `.png` に変更。

**ファイル名**: 絶望系は `hiroko-zetsubou.png`（`zetubou` ではない）— character-avatars.md 正本に従う。

## ライセンス

- 同梱の `.svg` は本リポジトリ用の簡易デフォルメ（オリジナル）です。
- diagram-invest 由来の PNG をコピーする場合は、**原本の利用条件**に従ってください。
