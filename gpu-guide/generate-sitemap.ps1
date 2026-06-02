$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sitemapPath = Join-Path $rootDir "sitemap.xml"
$defaultBaseUrl = "https://sippo79.github.io/gpu-guide/"
$ignoredDirs = @(".git", ".github", "node_modules")

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
      -not ($pathParts | Where-Object { $ignoredDirs -contains $_ })
    } |
    ForEach-Object { ConvertTo-UrlPath $_.FullName } |
    Sort-Object @{ Expression = { if ($_ -eq "index.html") { "0" } else { "1$_" } } }
}

function Get-GpuDetailUrlPaths {
  $gpuPagePath = Join-Path $rootDir "gpu.html"
  $gpuDataPath = Join-Path $rootDir "gpus.json"

  if (-not (Test-Path $gpuPagePath) -or -not (Test-Path $gpuDataPath)) {
    return @()
  }

  $gpus = Get-Content -Raw -Encoding UTF8 $gpuDataPath | ConvertFrom-Json

  return @(
    $gpus |
      Where-Object { $_.id } |
      ForEach-Object { "gpu.html?id=$([uri]::EscapeDataString($_.id))" }
  )
}

function Escape-Xml {
  param([string]$Value)

  return [System.Security.SecurityElement]::Escape($Value)
}

$baseUrl = Get-BaseUrl
$urlPaths = @()
$urlPaths += Get-HtmlUrlPaths
$urlPaths += Get-GpuDetailUrlPaths
$urlPaths = $urlPaths | Select-Object -Unique

$lines = @(
  '<?xml version="1.0" encoding="UTF-8"?>'
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
)

foreach ($urlPath in $urlPaths) {
  $loc = Escape-Xml "$baseUrl$urlPath"
  $lines += "  <url>"
  $lines += "    <loc>$loc</loc>"
  $lines += "  </url>"
}

$lines += "</urlset>"

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($sitemapPath, (($lines -join "`n") + "`n"), $utf8NoBom)

Write-Host "Generated sitemap.xml with $($urlPaths.Count) URLs."
