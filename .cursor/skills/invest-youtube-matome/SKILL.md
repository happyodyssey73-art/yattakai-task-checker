---
name: invest-youtube-matome
description: >-
  Structures multiple Japanese investment YouTubers' latest market-related videos into a same-day or weekly digest, clusters topics, builds comparison matrices with disagreement labels, and verifies claims against Japanese news (plus English primary sources for US rates/equity clusters). Outputs compact HTML first (matrix + verification strip + mandatory short Hiroko/Ichisan dialogue + My Strategy whitespace), with optional long-form fallback. Use when the user asks for 投資YouTubeまとめ, YouTuber opinion comparison, 今週のYouTubeまとめ, 全市場ダイジェスト, or similar curation of investment YouTube vs news/X.
---

# 投資YouTubeまとめ（invest-youtube-matome）

**ゴール**: 投資歴2〜5年で、複数の投資YouTubeを追い切れない個人投資家が、**誰が何を主張しているか**と**主張同士のズレの種類**、**ニュース／Xとの整合**を短時間で把握できるようにする。**ヒロ子・イチさんの短い対話**で一度噛み砕く（必須・詳細は `references/html-character-dialogue.md`）。**投資助言ではない**（免責は必須）。

**diagram-invest との棲み分け**: diagram-invest は相場の物語・教材型の長文ブログ。**本スキルは YouTube 主張の構造化と検証ビュー**が主役。ニュースは裏取り用。

## 正本（SSOT）とコピー先

- **正本**: このリポジトリの **`.cursor/skills/invest-youtube-matome/`**（Git にコミットする想定）。  
- **グローバルコピー**: `%USERPROFILE%\.cursor\skills\invest-youtube-matome\` は **実行環境用の複製**。正本を更新したら [references/install-global.md](references/install-global.md) の手順で上書きコピーする。  
- 版メモ: [references/VERSION](references/VERSION)

## YouTube 取得が失敗したとき（縮退）

- **既定**: **取得できたチャンネルのみ**でページを生成する。冒頭に **未取得・`fetch_failed` のチャンネル名（または handle）を列挙**し、解釈が薄くなる旨を1文入れる。  
- **全体中止**: ユーザーが明示したとき、または **採用可能な `video` が1本も無い** ときは、公開用 HTML を出さず「本日は生成不可」と内部メモ＋ユーザーへの短い説明に留める。

---

## 着手前（必読の順）

詳細は **[references/required-reading.md](references/required-reading.md)**。着手時は次をこの順で読む。

1. [references/channels.md](references/channels.md) — 対象チャンネル・`{channels_override}` 構文  
2. [references/window-and-triggers.md](references/window-and-triggers.md) — `{動画鮮度窓}` 2d/7d・**JST 基準**  
3. [references/video-selection.md](references/video-selection.md) — 相場系判定・非表示・さかのぼり上限  
4. [references/research-prompt-youtube.md](references/research-prompt-youtube.md) — Phase 0 返却 JSON・`skip_reason`  
5. [references/claim-normalization.md](references/claim-normalization.md) — 主張カード（`id` 必須）  
6. [references/clustering.md](references/clustering.md) — クラスタ上限  
7. [references/clusters-output-schema.md](references/clusters-output-schema.md) — Phase 3 凍結 JSON（`clusters[]`）  
8. [references/disagreement-labels.md](references/disagreement-labels.md) — 代表2主張・ラベル  
9. [references/verification-rubric.md](references/verification-rubric.md) — 裏取り・表示用日本語  
10. [references/sources-news.md](references/sources-news.md) — ニュース鮮度・媒体方針  
11. [references/market-snapshot.md](references/market-snapshot.md) — 市場一覧（compactでは薄く）  
12. [references/visual-signal.md](references/visual-signal.md) — 二重信号機  
13. [references/html-structure.md](references/html-structure.md) — compact **骨格・CSS**（diagram-maji 型）  
14. [references/exemplar.md](references/exemplar.md) — **読み順**・模範ワイヤ  
15. [references/html-compact-template.md](references/html-compact-template.md) — 必須 id・引用・表ルール  
16. [references/diagram-invest-character-bridge.md](references/diagram-invest-character-bridge.md) — **diagram-invest を会話・口調・画像命名の正本とする宣言**（必読・二重定義の防止）  
17. [references/html-character-dialogue.md](references/html-character-dialogue.md) — **ヒロ子・イチさん**必須短対話（HTML・配置・PNG `src`）  
18. [references/character-avatars-compact.md](references/character-avatars-compact.md) — **アバター画像・`.iyt-chat-row` 吹き出し**（diagram-invest 同型・`docs/avatars` → `assets/characters/`）  
19. [references/character-usage.md](references/character-usage.md) — diagram-invest 正本への索引＋ digest 用の短い差分  
20. [references/dialogue-generation-youtube.md](references/dialogue-generation-youtube.md) — `dialogue-generation.md` 継承表＋YouTube 固有ルール  
21. [references/quality-checklist.md](references/quality-checklist.md) — 公開前ゲート  
22. [references/review-prompt.md](references/review-prompt.md) — **Phase 8** レビュー注入文  
23. [references/install-global.md](references/install-global.md) — グローバルコピー手順  

法務: [references/legal-disclaimer.md](references/legal-disclaimer.md)  
底打ち指標の説明: [references/indicators-triggers.md](references/indicators-triggers.md)  
長文化フォールバック: [references/html-long-fallback.md](references/html-long-fallback.md)  
デプロイ: [references/deploy-and-url.md](references/deploy-and-url.md)  
Phase 8 レビュー: [references/review-prompt.md](references/review-prompt.md)  
グローバル配置: [references/install-global.md](references/install-global.md)

---

## 計測について

静的 HTML のみでは **保存率・投げ銭率などのプロダクトKPIは計測しない**。スキルの完了条件は **quality-checklist** のゲートで定義する。

## ターゲット読者（要約）

| 項目 | 内容 |
|------|------|
| 投資経験 | おおむね2〜5年 |
| 困り事 | 人気YouTuberが多く全部見られない。意見の一致／不一致が分かりにくい。ニュース・Xとの整合も確認したい |
| 用語 | PER/PBR 等は聞いたことがあるが深くは知らない。**社会人1年目でも通る**短い比喩で初出説明（辞典は Reference） |
| 知りたいこと | 世界情勢・金利の「なぜ」、過去類似と株の動き、チャート上下の**分析の言い分**（主張として整理） |
| トーン | 情報収集として使える**ポップさ**も欲しいが、煽りを増幅しない |

---

## 入力パラメータ

| パラメータ | 既定 | 説明 |
|------------|------|------|
| `{動画鮮度窓}` | 自動 | [window-and-triggers.md](references/window-and-triggers.md)。週次キーワードがあれば `7d`、なければ `2d`。**8日以上前の動画は不採用**（上限7d）。 |
| `{channels_override}` | なし | [channels.md](references/channels.md) の固定リストの**部分集合**（例：今夜は4chだけ）。 |
| `{ニュース鮮度}` | 依頼なしなら「直近24時間中心」 | ニュース・X・Googleトレンドの収集窓。**過去の金融史・類似事例は窓の外でも可**。 |
| `{出力モード}` | `compact` | `compact` 優先。レイアウトは [html-structure.md](references/html-structure.md)・[exemplar.md](references/exemplar.md)、**キャラ対話**は [html-character-dialogue.md](references/html-character-dialogue.md)、ルールは [html-compact-template.md](references/html-compact-template.md)。困難なら `long`（[html-long-fallback.md](references/html-long-fallback.md)）。 |

---

## データ階層（思考順）

1. **L1 主張**: 各動画から抽出した**構造化主張**（強気度・時間軸・根拠タイプ・**根拠メタ**: 字幕由来等）。  
2. **L2 裏取り**: ニュース／X による**検証ラベル**（正本 [verification-rubric.md](references/verification-rubric.md)）。米株・金利クラスタは **Phase 5a 英語一次 → Phase 5b 日本語L2** の二段。  
3. **L3 市場体温**: VIX・主要指数・セクター等の**短いスナップショット**（断定しない）。**compact では薄く**（比較マトリクス最優先）。

---

## コアワークフロー（フェーズ）

**ダイジェスト正**: 横並び → タグ → **クラスタ** → **クラスタ内だけ**比較表・裏取り。詳細手順は [references/digest-workflow.md](references/digest-workflow.md)。

| Phase | 内容 | 正本 |
|-------|------|------|
| 0-pre | `channels.md`・窓・ニュース方針を読み、サブエージェント用に**変数注入**（プロンプトだけでは参照ファイルを自動読込できない前提） | channels, window, sources-news |
| 0 | YouTube 収集（窓・相場系・非表示）＋必要なら X／トレンド | research-prompt-youtube |
| 1 | 主張カード化・タグ付け | claim-normalization |
| 2 | クラスタリング | clustering |
| 3 | クラスタ成果の **凍結**: [clusters-output-schema.md](references/clusters-output-schema.md) に沿い `clusters[]` と `claim_cards[]`（各 `id` 付き）を確定。以降の改変は禁止（誤り修正のみ） | clusters-output-schema, clustering, claim-normalization |
| 4 | 代表2主張の選定＋ `前提ズレ` / `本音の対立`（**対立軸1本**） | disagreement-labels |
| 5 | 裏取り（**読者向けの裏取り正本**）。米株・金利クラスタ: **5a 英語一次** → **5b 日本語L2** | verification-rubric, sources-news |
| 6 | 市場体温ミニ（compact では最小） | market-snapshot |
| 7 | HTML（`compact` 既定）。骨格・読み順は [html-structure.md](references/html-structure.md)・[exemplar.md](references/exemplar.md)。**キャラ正本の入口**は [diagram-invest-character-bridge.md](references/diagram-invest-character-bridge.md)。**キャラ短対話**は [html-character-dialogue.md](references/html-character-dialogue.md)（口調・L1/L2/L3 は diagram-invest の `dialogue-generation.md`／`character-voice.md`、差分は dialogue-generation-youtube）。アバター・吹き出しは [character-avatars-compact.md](references/character-avatars-compact.md)（**PNG 既定**・`docs/avatars` からコピー）。必須 `id`: **`iyt-read-path`**・`iyt-executive`・`iyt-dual-signal`・**`iyt-character-dialogue`**・`iyt-my-strategy`（[html-compact-template.md](references/html-compact-template.md)） | html-structure, exemplar, html-compact-template, diagram-invest-character-bridge, html-character-dialogue, character-avatars-compact, character-usage, dialogue-generation-youtube, visual-signal, legal |
| 8 | 批判的レビュー（readonly サブエージェント推奨） | [review-prompt.md](references/review-prompt.md) に `{path}` `{video_window}` を注入 |
| 9 | 修正・鮮度・引用・窓外混入の最終確認＋補助スクリプト | quality-checklist, legal、[scripts/check_invest_youtube_matome.mjs](scripts/check_invest_youtube_matome.mjs)、[scripts/validate-phase0-json.mjs](scripts/validate-phase0-json.mjs)（Phase 0 JSON 保存時） |
| 10 | **毎回 Surge** で閲覧 URL を発行し、完了後 **happyodyssey73@gmail.com** へ通知（補助: [scripts/notify_deploy_complete.mjs](scripts/notify_deploy_complete.mjs)） | [deploy-and-url.md](references/deploy-and-url.md) |

---

## 証拠（トランスクリプト）ルール

- 可能なら **トランスクリプト由来**を明示し、**自動字幕の限界**を注記する（Reference: [research-prompt-youtube.md](references/research-prompt-youtube.md) の `evidence_grade`）。  
- 降格（説明欄のみ・要約のみ）はチェーンに従い、**要約は解釈を含む**と明記。

---

## 個別株・売買表現

- 個別株・テーマ株（Xトレンド由来含む）は **発言の引用としてのみ**可。**免責と並記**。  
- **エージェント自身の売買提案**（いま買い、全ツ、利確しろ等）は書かない。

---

## compact の優先順位（確定）

- **① 比較マトリクス最優先**（ただし **`iyt-read-path` でレールを先に敷く**。読み順は [exemplar.md](references/exemplar.md)）。  
- **② ヒロ子・イチさんの短い対話は省略しない**（`iyt-character-dialogue`。正本 [html-character-dialogue.md](references/html-character-dialogue.md)）。  
- 市場体温・二重信号機等は **薄く**（最上段の1行〜ミニブロックに収める方針は [html-compact-template.md](references/html-compact-template.md)）。

---

## X・Googleトレンド

- `{ニュース鮮度}` に従いトレンドをピックアップし、主張・銘柄例との**整合確認**に使う。  
- テーマ株例（バズ→関連銘柄）は**出典と「例」であること**を明示。深掘りは主軸を圧迫しないよう上限を clustering／品質チェックに従う。

---

## 完了条件（要約）

- `{動画鮮度窓}` が正しく適用され、**窓外動画が混入していない**  
- 非相場系の最新を誤って主張根拠にしていない（該当chは非表示でよい）  
- 米株・金利クラスタで **Phase 5a 英語一次 → Phase 5b 日本語L2** が通っている  
- 不一致は **代表2主張・対立軸1本**の上限を守る  
- 免責・引用・根拠メタ・HTML の必須ブロック（My Strategy 余白含む）を満たす  

全文は [references/quality-checklist.md](references/quality-checklist.md)。

---

## `{出力モード}` フォールバック（例）

次のいずれかで `long` へ切替、または「上位Kクラスタのみ compact＋折りたたみ」を検討する（詳細は quality-checklist）。

- クラスタ数が多く compact が読み損ねる  
- 字幕品質が低く引用が成立しない割合が高い  
- 裏取りが「未確認」過多で誤解リスクが高い  

---

## 市場カバレッジ（L3 で触れる範囲）

米株・日株・欧州・インド・中国の流れ、ドル円・金・ビットコイン・原油・米10年国債・VIX、**セクター强弱**（compact では要約）。詳細列は [market-snapshot.md](references/market-snapshot.md)。

---

## 追加リソース

- 一次調査プロンプト: [references/research-prompt-youtube.md](references/research-prompt-youtube.md)  
- 日次ダイジェストの内部手順全文: [references/digest-workflow.md](references/digest-workflow.md)  
- Phase 8: [references/review-prompt.md](references/review-prompt.md)  
- Phase 9 補助（HTML）: `node scripts/check_invest_youtube_matome.mjs --file {生成HTMLのパス}`  
- Phase 0 JSON 補助: `node scripts/validate-phase0-json.mjs --file {phase0.jsonのパス}`  
- 全リポジトリ利用: [references/install-global.md](references/install-global.md)
