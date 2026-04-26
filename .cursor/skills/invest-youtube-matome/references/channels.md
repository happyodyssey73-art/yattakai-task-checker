# 対象 YouTube チャンネル（正本）

## 固定リスト（既定で比較対象）

ユーザーが `{channels_override}` を渡さないときは、以下を対象とする。URLは公式チャンネルの `@handle` 形式。

| # | 表示名（参考） | URL |
|---|----------------|-----|
| 1 | のぶちゃん塾 | https://www.youtube.com/@nobujuku |
| 2 | バフェッ太郎 | https://www.youtube.com/@buffett_taro |
| 3 | 田端タカシ | https://www.youtube.com/@tabbata |
| 4 | 堀江貴文 ホリエモン | https://www.youtube.com/@investor-Horie |
| 5 | バッちゃま | https://www.youtube.com/@bacchama |
| 6 | リベラルタ久保 | https://www.youtube.com/@%E3%83%AA%E3%83%99%E3%83%AB%E3%82%BF%E4%B9%85%E4%BF%9D |
| 7 | invest_study | https://www.youtube.com/@invest_study |
| 8 | 楽待 | https://www.youtube.com/@rakumachi |
| 9 | trader-merry | https://www.youtube.com/@trader-merry |
| 10 | Dan Takahashi | https://www.youtube.com/@DanTakahashi1 |
| 11 | ゆるまず投資 | https://www.youtube.com/@yurumazu |

## `{channels_override}` 構文（正）

次の **いずれか1形式のみ** を正とする（混在させない）。

### 形式 A（推奨）

- `@handle` を **半角カンマ区切り**（スペース可）。  
- 例: `@nobujuku,@buffett_taro,@tabbata`

### 形式 B

- チャンネル URL を **半角カンマ区切り**（スペース可）。  
- 例: `https://www.youtube.com/@nobujuku,https://www.youtube.com/@buffett_taro`

## 検証ルール

- 上記固定リストに **存在しない handle / URL は拒否**し、Phase 0-pre でユーザーに訂正を依頼する。  
- **リスト外のチャンネルを勝手に追加しない**（追加要望はユーザー確認後に本ファイルを更新）。

## 非表示の定義

その回の `{動画鮮度窓}` 内に **採用可能な相場系動画が1本もない** チャンネルは、比較表・マトリクスから **行ごと非表示**（「今回は対象なし」行を増やしすぎない）。

## メンテナンス

- チャンネル廃止・改名時は URL を更新し、SKILL の description に影響があれば追随する。
