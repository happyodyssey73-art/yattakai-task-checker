# 品質チェックリスト（最終ゲート）

## コンテンツ

- [ ] `{動画鮮度窓}` が `2d` または `7d` で、**8日以上前の動画**が混入していない  
- [ ] 非相場系を誤採用していない。非表示chは表に出していない  
- [ ] 主張カードに **動画リンク・公開日時・evidence_grade** がある  
- [ ] 自動字幕時は **限界注記**がある  
- [ ] 米株・金利クラスタで **5a 英語一次 → 5b 日本語L2** が満たされている  
- [ ] 不一致は **代表2主張・対立軸1本**の上限を守っている  
- [ ] 個別株は **引用枠**に収まり、**エージェントの売買提案**がない  
- [ ] 免責が読める位置にある  

## 裏取り・トーン

- [ ] 製作メタ・検索言い訳が本文にない  
- [ ] X は **厳選**され、一次未確認なら明記  
- [ ] 検証ラベルが付いているか、`unverified` を濫用していない  
- [ ] HTML では検証ラベルが **日本語表示**になっている（内部キー `supported` 等の生露出なし）  

## compact 特有

- [ ] **比較マトリクスが視覚的に主役**（①優先）  
- [ ] 市場体温は **薄く**済ませている  
- [ ] [html-structure.md](html-structure.md)／[exemplar.md](exemplar.md) に沿い **`<main>`** と **`.section-card`** でレールが付いている  
- [ ] **`id="iyt-read-path"`** で「まず読む3つ」があり、**表より上**にある  
- [ ] **`id="iyt-executive"`** の Executive strip がある（2行要約）  
- [ ] **`id="iyt-dual-signal"`** の二重信号機がある  
- [ ] **`id="iyt-my-strategy"`** があり、**非保存**が明記されている  
- [ ] スマホで **カードスタック等の縦読み**がある（列多い表の横スクロール地獄を避けている）  
- [ ] **`lucide.createIcons()`** を呼んでいる  
- [ ] **`id="iyt-character-dialogue"`** があり、[html-character-dialogue.md](html-character-dialogue.md) に沿った **ヒロ子＋イチさんの短い対話**が **`iyt-my-strategy` より上**にある  
- [ ] 会話品質は diagram-invest の **`dialogue-generation.md`**（§0b 朗読・§1b 転写禁止・§2b 進行役禁止）を踏んでいる（入口: [diagram-invest-character-bridge.md](diagram-invest-character-bridge.md)）  
- [ ] 対話に **「ヒロ子:」「イチさん:」**（またはイチさん本文に **ワシ**）が含まれ、[character-usage.md](character-usage.md)・[dialogue-generation-youtube.md](dialogue-generation-youtube.md) に反していない  
- [ ] **アバターは本番 PNG**（`assets/characters/*.png` が HTML と同じデプロイ単位に同梱されている。バンクは `docs/avatars/`）  
- [ ] クラスタが多いとき **折りたたみ**または `long` 切替の判断が記録されている（内部メモ可）  

## long 切替の判断例（満たすなら検討）

- クラスタ数 > 5 または展開クラスタ > 3 で読みづらい  
- `transcript_auto` / `summary_only` が過半数で引用品質が低い  
- `unverified` が連続して読者誤解リスクが高い  

## HTML / a11y

- [ ] `title` / `h1` / OGP の主題が一致  
- [ ] 表に意味のわかる見出しがある  
- [ ] Lucide 以外の装飾で情報を依存していない  

## デプロイ（Phase 10）

- [ ] **Surge**（または同等）で **毎回** 公開し、URL がブラウザで開ける  
- [ ] デプロイ完了後、**happyodyssey73@gmail.com** に URL が伝わる（Resend 等で `notify_deploy_complete.mjs`、または手動メール）  

詳細は [deploy-and-url.md](deploy-and-url.md)。

## Phase 9 補助スクリプト（推奨）

スキルディレクトリはリポジトリまたは `%USERPROFILE%\.cursor\skills\invest-youtube-matome\` のいずれか。`{生成HTML}` を実パスに置換して実行する。

| 目的 | コマンド |
|------|----------|
| 免責・YouTubeリンク・製作メタ・必須 id（`iyt-character-dialogue` 含む）・My Strategy 等の機械チェック | `node scripts/check_invest_youtube_matome.mjs --file {生成HTML}` |
| Phase 0 JSON の必須キー検査 | `node scripts/phase0/validate-phase0-json.mjs --file {phase0.json}` |
| デプロイ完了メール（Resend の `RESEND_API_KEY` / `RESEND_FROM` が必要） | `node scripts/notify_deploy_complete.mjs --url {公開URL} [--title 短い件名]` |

- **`[FAIL]`**: 修正してから再実行する。  
- **`[WARN]`**: 人手確認。**CI では WARN を失敗にしない**運用を既定とする（WARN を gate にする場合はリポジトリの CI 設定で明示的に切替）。
