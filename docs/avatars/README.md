# キャラクター PNG（リポジトリ共通バンク）

## 役割

**diagram-invest** と **invest-youtube-matome** で共通の **ヒロ子／イチさん（チャートマスター）** 表情アセットを置く。  
各ファイルの**意味・いつ使うか・`alt` の型**の正本は、diagram-invest の `references/character-avatars.md`（グローバル例: `%USERPROFILE%\.cursor\skills\diagram-invest\references\character-avatars.md`）。

## ファイル一覧

| 接頭辞 | 枚数 | 備考 |
|--------|------|------|
| `hiroko-*.png` | 10 | 絶望は正本では **`hiroko-zetsubou.png`**（ヘボン式）。本リポは歴史的に **`hiroko-zetubou.png`** も併存し得る → HTML の `src` は**実在ファイル名**に合わせる。 |
| `ichisan-*.png` | 6 | イチさん＝チャートマスターと同一人物。 |

## invest-youtube-matome へ載せる手順

Surge は**フォルダ単位**のため、`docs/invest-youtube-matome-{日付}/assets/characters/` に**デプロイに必要な PNG をコピー**してから `surge .` する（[character-avatars-compact.md](../../.cursor/skills/invest-youtube-matome/references/character-avatars-compact.md)）。

PowerShell の例:

```powershell
$av = "docs/avatars"
$to = "docs/invest-youtube-matome-20260425/assets/characters"
Copy-Item "$av/hiroko-confused.png","$av/ichisan-serious.png" $to -Force
```

## ライセンス・取り扱い

運用チームが用意したキャラ素材としてリポジトリ内で使用する。外部転載時は権利表記方針に従うこと。
