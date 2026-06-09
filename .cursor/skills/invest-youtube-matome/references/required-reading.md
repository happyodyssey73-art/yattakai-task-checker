# 必読参照（着手順）

本スキルは **参照分割** を前提にする。各 Phase に入る前に、SKILL.md のフェーズ表と本ファイルの該当行を確認する。

## 毎回最初（固定順）

1. `channels.md` — 対象ch・`{channels_override}` 構文  
2. `window-and-triggers.md` — `{動画鮮度窓}` 2d/7d・**JST**  
3. `video-selection.md` — 相場系・非表示・さかのぼり・鮮度  
4. `research-prompt-youtube.md` — Phase 0 の返却JSON・`skip_reason`  
5. `claim-normalization.md` — 主張カード（`id`）  
6. `clustering.md` — クラスタ上限・命名  
7. `clusters-output-schema.md` — Phase 3 凍結 JSON  
8. `disagreement-labels.md` — 代表2主張・ラベル  
9. `verification-rubric.md` — 裏取り・**5a/5b**・表示用日本語  
10. `sources-news.md` — ニュース鮮度・媒体方針  
11. `market-snapshot.md` — L3 最小セット  
12. `visual-signal.md` — 二重信号機（`id="iyt-dual-signal"`）  
12.5. `phase0-cli.md` — **Phase 0 機械収集 CLI 正本**（Data API＋yt-dlp・検証・HTMLたたき台）／索引: `runbook-youtube-data-api-and-ytdlp.md`  
13. `html-structure.md` — compact **骨格・CSS**（diagram-maji 型）  
14. `exemplar.md` — **読み順**・模範ワイヤ  
15. `html-compact-template.md` — 必須 id・引用・表ルール  
16. `html-deep-template.md` — **deep.html（中身重視）**の必須 id・引用密度・照合マップ  
17. `phase7-html-generation-prompt.md` — Phase 7 の **コピペ用プロンプト正本**（index+deepを安定生成）  
18. `diagram-invest-character-bridge.md` — diagram-invest を会話・口調・画像命名の正本とする宣言（必読）  
19. `html-character-dialogue.md` — **ヒロ子・イチさん**必須短対話（HTML・配置・PNG `src`）  
20. `character-avatars-compact.md` — アバター・`.iyt-chat-row`（`docs/avatars` → `assets/characters/`・PNG 既定）  
21. `character-usage.md` — diagram-invest 正本への索引＋ digest 差分  
22. `dialogue-generation-youtube.md` — `dialogue-generation.md` 継承表＋YouTube 固有  
23. `quality-checklist.md` — 最終ゲート  
24. `review-prompt.md` — **Phase 8** サブエージェント注入文  
25. `install-global.md` — グローバルコピー手順  

## Phase 別（追加で開く）

| Phase | 追加で開く |
|-------|------------|
| 指標コピー | `indicators-triggers.md` |
| long へ切替 | `html-long-fallback.md` |
| Phase 7 HTML | `html-structure.md`, `exemplar.md`, `html-compact-template.md`, `html-deep-template.md`, `phase7-html-generation-prompt.md`, `diagram-invest-character-bridge.md`, `html-character-dialogue.md`, `character-avatars-compact.md`, `character-usage.md`, `dialogue-generation-youtube.md` |
| デプロイ | `deploy-and-url.md` |
| 法務表現 | `legal-disclaimer.md` |
| Phase 8 レビュー | `review-prompt.md` |
| グローバルコピー | `install-global.md` |

HTML 生成（Phase 7）では `html-structure.md` → `exemplar.md` → `html-compact-template.md` → `diagram-invest-character-bridge.md` → `html-character-dialogue.md` → `character-avatars-compact.md` → `character-usage.md` → `dialogue-generation-youtube.md` の順で必ず当たる。

## ワークフロー全文

- `digest-workflow.md` — 横並び→クラスタ→凍結→表の内部手順
