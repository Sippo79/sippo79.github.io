# =====================================================================
#  ⚠️ 2026-09-02〜 このスクリプトは使わないこと（廃止）
# ---------------------------------------------------------------------
#  GPU個別ページを静的化したため（/gpu-guide/gpu/<id>/）、
#  sitemap.xml は generate-gpu-pages.js が生成する（65URL）。
#
#  このスクリプトは *.html を再帰的に拾うだけなので、実行すると
#  gpu/<id>/index.html という「index.html付きURL」で上書きしてしまい、
#  各ページの canonical（ディレクトリURL）と食い違う。
#
#  sitemap を更新したいとき:  node gpu-guide/generate-gpu-pages.js
#
#  誤実行を防ぐガード。どうしても実行する場合のみ -Force を付ける。
# =====================================================================
param([switch]$Force)

if (-not $Force) {
  Write-Host "[廃止] このスクリプトは使いません。sitemap は次で生成してください:"
  Write-Host "        node gpu-guide/generate-gpu-pages.js"
  exit 1
}

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sitemapPath = Join-Path $rootDir "sitemap.xml"
$defaultBaseUrl = "https://sippo-pc.jp/gpu-guide/"
$ignoredDirs = @(".git", ".github", "node_modules")

# sitemap から除外するHTMLファイル名。
# gpu.html はJS描画のSPA（canonicalは常に素のgpu.html）。gpu.html?id=* を
# 並べると全URLが1ページに正規化され重複/soft404になるため、個別GPUを
# 静的ページ化するまでは gpu.html 自体も個別URLも sitemap に載せない。
$ignoredHtmlFiles = @("gpu.html")

function Normalize-BaseUrl {
  param([string]$Url)

  if ($Url.EndsWith("/")) {
    return $Url
  }

  return "$Url/"
}

function Get-BaseUrl {
  $indexPath = Join-Path $rootDir "index.html"

  if (-not (Test-Path $indexPath)) {
    return $defaultBaseUrl
  }

  $indexHtml = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
  $match = [regex]::Match($indexHtml, '<meta\s+property=["'']og:url["'']\s+content=["'']([^"'']+)["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

  if ($match.Success) {
    return Normalize-BaseUrl $match.Groups[1].Value
  }

  return $defaultBaseUrl
}

function ConvertTo-UrlPath {
  param([string]$FilePath)

  $rootUri = New-Object System.Uri (($rootDir.TrimEnd("\", "/")) + [System.IO.Path]::DirectorySeparatorChar)
  $fileUri = New-Object System.Uri $FilePath
  return [System.Uri]::UnescapeDataString($rootUri.MakeRelativeUri($fileUri).ToString())
}

function Get-HtmlUrlPaths {
  Get-ChildItem -Path $rootDir -Recurse -File -Filter "*.html" |
    Where-Object {
      $relativePath = ConvertTo-UrlPath $_.FullName
      $pathParts = $relativePath -split '[\\/]'
      (-not ($pathParts | Where-Object { $ignoredDirs -contains $_ })) -and
      ($ignoredHtmlFiles -notcontains $_.Name)
    } |
    ForEach-Object { ConvertTo-UrlPath $_.FullName } |
    Sort-Object @{ Expression = { if ($_ -eq "index.html") { "0" } else { "1$_" } } }
}

function Escape-Xml {
  param([string]$Value)

  return [System.Security.SecurityElement]::Escape($Value)
}

$baseUrl = Get-BaseUrl
$urlPaths = @()
$urlPaths += Get-HtmlUrlPaths
$urlPaths = $urlPaths | Select-Object -Unique

$lines = @(
  '<?xml version="1.0" encoding="UTF-8"?>'
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
)

foreach ($urlPath in $urlPaths) {
  # index.html はディレクトリ正規URL（末尾スラッシュ）に統一し、
  # canonical / og:url（= https://sippo-pc.jp/gpu-guide/）と一致させる。
  $normalizedPath = if ($urlPath -eq "index.html") { "" } else { $urlPath }
  $loc = Escape-Xml "$baseUrl$normalizedPath"
  $lines += "  <url>"
  $lines += "    <loc>$loc</loc>"
  $lines += "  </url>"
}

$lines += "</urlset>"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($sitemapPath, (($lines -join "`n") + "`n"), $utf8NoBom)

Write-Host "Generated sitemap.xml with $($urlPaths.Count) URLs."
