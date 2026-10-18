# 旧ジェネレーター（PowerShell版）は 2026-10-18 に generate-games.js（Node）へ置き換えた。
# これまでどおり .\Generate-StaticGames.ps1 で実行できるよう、Node 版を呼ぶだけのラッパーとして残す。
# 本体の説明は generate-games.js の先頭コメントを参照。
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $root "generate-games.js")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
