# 全リポジトリで使う（グローバルインストール）

Cursor の **個人用スキル**は `%USERPROFILE%\.cursor\skills\`（mac/Linux は `~/.cursor/skills/`）に置くと、開いているワークスペースを問わず参照されやすい。

`references/VERSION` も含め、**スキルディレクトリ丸ごと**をコピーする。

## Windows（PowerShell）

リポジトリ内のスキルを **丸ごと上書きコピー**する例（パスは環境に合わせて変更）:

```powershell
$src = "C:\Users\happy\.cursor\src\yattakai-task-checker\.cursor\skills\invest-youtube-matome"
$dst = Join-Path $env:USERPROFILE ".cursor\skills\invest-youtube-matome"
New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
Copy-Item -Path $src -Destination $dst -Recurse -Force
```

## 同期の考え方

- **正本をリポジトリ**（`.cursor/skills/invest-youtube-matome/`）に置き、更新したら上記を再実行してグローバルへコピーする。  
- または **正本をグローバル**に置き、リポジトリ側はショートカットや README のみ、など運用で揃える。

## チェックスクリプトの実行場所

`scripts/check_invest_youtube_matome.mjs` は **スキルディレクトリをカレントにしなくても** `--file` に絶対パスを渡せば動く。

```powershell
node "C:\Users\happy\.cursor\skills\invest-youtube-matome\scripts\check_invest_youtube_matome.mjs" --file "C:\path\to\generated.html"
```

リポジトリのみにスキルがある場合は、`$src` をその `invest-youtube-matome` パスに置き換える。
