# diagram-invest キャラ正本ブリッジ（invest-youtube-matome）

## 目的（なぜこのファイルがあるか）

invest-youtube-matome の **ヒロ子・イチさん**は、diagram-invest の **ヒロ子・チャートマスター**と **同一人物・同一口調・同一画像命名**として扱う。  
ここでは **「どのファイルが正本か」** と **読む順序** だけを固定し、二重定義を避ける。

## diagram-invest 側の正本（グローバル・パス例）

リポジトリ外のスキル複製を前提に、次のディレクトリを **キャラの完全正本**とする（例は Windows）。

```
%USERPROFILE%\.cursor\skills\diagram-invest\references\
```

| 順 | ファイル | 内容 |
|----|----------|------|
| 1 | `character-usage.md` | **索引・必読順**（子ファイルへの入口） |
| 2 | `character-profiles.md` | 呼称・役割・人物像・セリフの型・対話パターンと表情の対応 |
| 3 | `character-voice.md` | **口調の統一ルール**・**模範会話（口調の金型）** |
| 4 | `dialogue-generation.md` | **L1→L2→L3**・**§1b 転写禁止**・**§2b 進行役禁止**・**§0b 朗読テスト** |
| 5 | `character-avatars.md` | 表情一覧・`alt` の型・`.chat-row` HTML 付録・デプロイ |

**口調の金型**は常に `character-voice.md` の **「模範会話（ユーザー定義・口調の金型）」** を最優先する。

## invest-youtube-matome 側の役割（差分だけ）

| ファイル | 役割 |
|----------|------|
| [character-usage.md](character-usage.md) | 上記正本への参照＋**YouTube digest 用の短い要約**（二重定義しない） |
| [dialogue-generation-youtube.md](dialogue-generation-youtube.md) | `dialogue-generation.md` の継承表＋**本スキル固有**の追加ルール |
| [html-character-dialogue.md](html-character-dialogue.md) | compact の **DOM・id・分量**（diagram の付録 HTML とはクラス名が `iyt-*` で異なる） |
| [character-avatars-compact.md](character-avatars-compact.md) | `#iyt-character-dialogue` 用の **配置・デプロイ単位**（`assets/characters/`） |

## 呼称（compact HTML）

- 見出し・ラベルは **「イチさん」** に寄せる（`html-character-dialogue.md`・チェッカ互換）。  
- セリフ内の一人称は **「ワシ」**（`character-voice.md` どおり）。  
- diagram-invest の記事では見出しに **「チャートマスター」** を使うことがあるが、**同一ページ内で呼称を混在させない**（`character-profiles.md` の呼称ルール）。

## 画像パイプライン（本リポジトリ）

1. **共通バンク**: リポジトリ直下の `docs/avatars/*.png`（運用説明は `docs/avatars/README.md`）。  
2. **Surge 直前**: `docs/{ドメイン}/assets/characters/` に必要な表情だけ **コピー**（`surge` はフォルダ単位）。  
3. **HTML**: `src="assets/characters/hiroko-confused.png"` のように **相対パス**（実在ファイル名に合わせる。`zetubou` / `zetsubou` の表記ゆれに注意）。

## 生成エージェントのチェックリスト（会話）

1. `character-profiles.md` → `character-voice.md` → `dialogue-generation.md` の **必読順**を踏んだか。  
2. セリフは **L2 経由**か（硬いニュース文の転写になっていないか）。`dialogue-generation.md` **§1b**。  
3. **進行役・司会**が入っていないか。`dialogue-generation.md` **§2b**。  
4. **イチさんにです・ます**が混ざっていないか。`character-voice.md` の禁止表。  
5. **朗読テスト**を満たすか。`dialogue-generation.md` **§0b**。  
6. **YouTube 固有**: 誰のどの動画かを **1 文で先に置く**か（`dialogue-generation-youtube.md`）。
