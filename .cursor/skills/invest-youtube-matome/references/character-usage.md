# キャラクター仕様（invest-youtube-matome）

## 正本の宣言（最重要）

**ヒロ子・イチさん（イチさん＝チャートマスター）の人物像・口調・会話プロトコル・表情一覧の完全正本は diagram-invest スキル**にある。  
本ファイルは **その正本への入口**と、**YouTube まとめ（compact）でだけ効く差分**に限定する（二重定義しない）。

| 何を決めるか | 正本（diagram-invest） |
|--------------|-------------------------|
| 索引・必読順 | `references/character-usage.md` |
| 呼称・役割・描写の型・YouTuber 言及の型 | `references/character-profiles.md` |
| **口調・禁止語・模範会話（金型）** | `references/character-voice.md` |
| **L1/L2/L3・§1b 転写禁止・§2b 進行役禁止・§0b 朗読テスト** | `references/dialogue-generation.md` |
| 表情ファイル名・`alt`・左右固定の HTML 付録 | `references/character-avatars.md` |

パス例: `%USERPROFILE%\.cursor\skills\diagram-invest\references\`  
本リポジトリ内の読み方の固定: **[diagram-invest-character-bridge.md](diagram-invest-character-bridge.md)**

## invest-youtube-matome での必読順（会話を書く前）

1. [diagram-invest-character-bridge.md](diagram-invest-character-bridge.md)（上表の確認）  
2. diagram-invest の `character-profiles.md` → `character-voice.md` → **`dialogue-generation.md`**（**§0b 朗読・§1b・§2b** まで）  
3. [dialogue-generation-youtube.md](dialogue-generation-youtube.md)（**本スキル固有**の上書き）  
4. [html-character-dialogue.md](html-character-dialogue.md)（`id`・分量・**PNG 配置**）  
5. [character-avatars-compact.md](character-avatars-compact.md)（`assets/characters/`・Surge 単位）

## 役割分担（プロダクト定義・要約）

diagram-invest の `character-profiles.md` と同一の前提:

- **ヒロ子**: 読者の代弁。SNS・YouTube の熱量・FOMO。**主観・勢い**。投資歴おおむね数年・直感派。  
- **イチさん（チャートマスター）**: 相場歴40年超のベテラン像。**客観・歴史・冷や水**。清原達郎氏を**モデル**とした語り口（**実在人物の発言の引用は不要**）。

## 口調（ここには書かない）

**細則・模範会話・禁止語の全文は diagram-invest の `character-voice.md` のみ**を正とする。  
invest-youtube 固有の追加禁止・追加型は [dialogue-generation-youtube.md](dialogue-generation-youtube.md)。

### compact で毎回守る最小チェック（抜粋）

- イチさん: **です・ます禁止**。一人称 **「ワシ」**。  
- ヒロ子: 一人称 **「あたし」**。**硬いニュース文をそのまま読まない**（`dialogue-generation.md` §1b）。  
- **進行役・司会**禁止（`dialogue-generation.md` §2b）。  
- **内部ラベル**（三角、メモ番号）をセリフに写さない。

## 画像・アバター

- **意味・時間軸・枚数**: diagram-invest `character-avatars.md`（`happy` / `euphoria` / `greed` の切り分け等）。  
- **本リポジトリの PNG バンク**: `docs/avatars/`（一覧は `docs/avatars/README.md`）。  
- **compact の HTML/CSS・Surge 単位**: [character-avatars-compact.md](character-avatars-compact.md)。  
- **ファイル名**: 正本は絶望 **`hiroko-zetsubou.png`**。リポに `hiroko-zetubou.png` しか無い場合は **`src` を実ファイルに合わせる**（欠落より優先）。

## 用語比喩（短い正本・初出用）

diagram-invest と同じ比喩セットを使う（初出の噛み砕き用）。詳細な辞典の正本は diagram-invest の `term-dictionary.md` 等に従う。

- **PER**: 会社の1年の利益に対して、株価が何年分の「給料」に相当するか、という粗いスケール感。  
- **PBR**: 会社を清算して現金化したらどれだけ残るか、を株価と比べた割安度の目安。  
- **VIX**: オフィス全体のピリつき度合いの比喩。  
- **出来高**: その日の株の手渡しのにぎわい。  
- **RSI**: 張り詰めメーター（目安であって確定シグナルではない）。  
- **織り込み**: 遠足前に雨前提で行動を決めるような、先回りの前提づけ。
