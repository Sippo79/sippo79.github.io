<#
  PC Builds Hub - sitemap 生成スクリプト (PowerShell 版)
  =====================================================================
  静的ページ + 「承認済み(status='approved')」の投稿詳細URLだけを並べた
  sitemap.xml を生成します。

  特徴:
   - 新規の有料API / 外部有料サービス / 従量課金は一切使いません。
     既存の Supabase（無料の anon key + RLS）の REST API を読むだけです。
   - 追加モジュール不要。Windows PowerShell 5.1 / PowerShell 7 で動きます。
   - 認証なし(anon)でアクセスするため、RLS により取得できるのは
     status='approved' の投稿のみ。未承認 / 下書き / 却下は出ません。
     （status=eq.approved は二重の安全策）

  使い方:
     powershell -ExecutionPolicy Bypass -File .\generate-sitemap.ps1
   生成後、sitemap.xml をコミットして GitHub Pages にデプロイしてください。
  =====================================================================
#>

$ErrorActionPreference = "Stop"

# --- 設定 -----------------------------------------------------------
$SiteBase   = "https://sippo-pc.jp/pc-builds-hub/"   # 末尾スラッシュ必須
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputFile = Join-Path $ScriptDir "sitemap.xml"
$ConfigFile = Join-Path $ScriptDir "supabase-config.js"
$PostLimit  = 5000

# サイトマップに必ず含める静的ページ（検索流入が不要なページは入れない）。
# login.html / mypage.html / submit.html / edit.html / admin.html は除外。
$StaticPages = @(
  @{ loc = "";              changefreq = "daily";  priority = "1.0" }  # = サイトルート(index)
  @{ loc = "all-posts.html"; changefreq = "daily";  priority = "0.9" }
  @{ loc = "post.html";      changefreq = "weekly"; priority = "0.3" }
)

# --- supabase-config.js から URL / anon key を読む（単一情報源） -----
function Get-SupabaseConfig {
  if (-not (Test-Path $ConfigFile)) { return @{ url = ""; anonKey = "" } }
  $text = Get-Content -Raw -Path $ConfigFile
  $url = ""; $anonKey = ""
  if ($text -match 'url\s*:\s*["''`]([^"''`]+)["''`]')     { $url = $Matches[1].Trim() }
  if ($text -match 'anonKey\s*:\s*["''`]([^"''`]+)["''`]') { $anonKey = $Matches[1].Trim() }
  return @{ url = $url; anonKey = $anonKey }
}

function Test-Placeholder([string]$value) {
  return [string]::IsNullOrEmpty($value) -or ($value -match 'YOUR_|example|xxxx')
}

# --- XML エスケープ -------------------------------------------------
function ConvertTo-XmlText([string]$value) {
  if ($null -eq $value) { return "" }
  return $value.Replace("&","&amp;").Replace("<","&lt;").Replace(">","&gt;").Replace('"',"&quot;").Replace("'","&apos;")
}

function ConvertTo-IsoDate($value) {
  if ([string]::IsNullOrEmpty($value)) { return $null }
  try { return ([DateTime]$value).ToString("yyyy-MM-dd") } catch { return $null }
}

# --- 承認済み投稿の取得（Supabase REST / anon） --------------------
function Get-ApprovedPosts($cfg) {
  if ((Test-Placeholder $cfg.url) -or (Test-Placeholder $cfg.anonKey)) {
    Write-Warning "Supabase 未設定のため、静的ページのみ出力します。"
    return @()
  }
  $endpoint = ($cfg.url.TrimEnd("/")) +
    "/rest/v1/posts?select=id,updated_at,created_at&status=eq.approved&order=created_at.desc&limit=$PostLimit"
  $headers = @{
    apikey        = $cfg.anonKey
    Authorization = "Bearer $($cfg.anonKey)"
    Accept        = "application/json"
  }
  $rows = Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get
  if ($null -eq $rows) { return @() }
  return @($rows)
}

# --- URL エントリ構築 ----------------------------------------------
function New-UrlEntry($loc, $lastmod, $changefreq, $priority) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("  <url>")
  $lines.Add("    <loc>$(ConvertTo-XmlText $loc)</loc>")
  if ($lastmod)    { $lines.Add("    <lastmod>$lastmod</lastmod>") }
  if ($changefreq) { $lines.Add("    <changefreq>$changefreq</changefreq>") }
  if ($priority)   { $lines.Add("    <priority>$priority</priority>") }
  $lines.Add("  </url>")
  return ($lines -join "`n")
}

# --- メイン ---------------------------------------------------------
try {
  $cfg   = Get-SupabaseConfig
  $posts = @(Get-ApprovedPosts $cfg)  # 単一要素でも配列として扱う（.Count を安定させる）

  $entries = New-Object System.Collections.Generic.List[string]
  foreach ($page in $StaticPages) {
    $entries.Add((New-UrlEntry ($SiteBase + $page.loc) $null $page.changefreq $page.priority))
  }
  foreach ($post in $posts) {
    if (-not $post.id) { continue }
    $loc = $SiteBase + "post.html?id=" + [Uri]::EscapeDataString([string]$post.id)
    $lastmod = ConvertTo-IsoDate ($post.updated_at, $post.created_at | Where-Object { $_ } | Select-Object -First 1)
    $entries.Add((New-UrlEntry $loc $lastmod "weekly" "0.7"))
  }

  $xml = '<?xml version="1.0" encoding="UTF-8"?>' + "`n" +
         "<!-- 自動生成: generate-sitemap.ps1（手で編集しないでください） -->" + "`n" +
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "`n" +
         ($entries -join "`n") + "`n" +
         "</urlset>" + "`n"

  # BOM なし UTF-8 で保存
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($OutputFile, $xml, $utf8NoBom)

  Write-Host "[generate-sitemap] 出力完了: $OutputFile （静的 $($StaticPages.Count) 件 + 承認済み投稿 $($posts.Count) 件）"
}
catch {
  Write-Error "[generate-sitemap] 失敗: $($_.Exception.Message)"
  exit 1
}
