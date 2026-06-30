# =========================
# PC BUILD CHECK - 個別構成ページ生成スクリプト
# 実行: PowerShellで .\generate-builds.ps1
# =========================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$builds    = Get-Content -Raw -Path "./builds.json" -Encoding UTF8 | ConvertFrom-Json
$SITE_BASE = "https://sippo-pc.jp/pc-build-check"

# Sippo 親サイトへの導線（ヘッダー内リンク / ドメイン移行時はここだけ変更）
$sippoHomeUrl = "https://sippo-pc.jp/"
$sippoMascot  = "https://sippo-pc.jp/assets/sippo/sippo-normal.webp"
$sippoHeaderLink = @"
        <a class="sippo-nav" href="${sippoHomeUrl}#consult" target="_blank" rel="noopener noreferrer" aria-label="Sippo（シッポ）公式サイトへ｜PC選びの相談ハブ">
          <img class="sippo-nav__icon" src="$sippoMascot" alt="" width="22" height="22" loading="lazy" decoding="async">
          <span class="sippo-nav__text">Sippoに相談</span>
        </a>
"@

$budgetLabel = @{ "100000"="10万円"; "150000"="15万円"; "200000"="20万円"; "250000"="25万円"; "300000"="30万円" }
$budgetSlug  = @{ "100000"="10man";  "150000"="15man";  "200000"="20man";  "250000"="25man";  "300000"="30man"  }
$usageLabel  = @{ "fps"="FPSゲーム"; "mmo"="MMO・RPG"; "stream"="配信・録画"; "creative"="動画編集・制作"; "daily"="普段使い" }
$resLabel    = @{ "fhd"="フルHD / 1080p"; "wqhd"="WQHD / 1440p"; "4k"="4K / 2160p" }
$resShort    = @{ "fhd"="フルHD"; "wqhd"="WQHD"; "4k"="4K" }

$suitedFor = @{
    "fps"      = @("Apex Legends・VALORANTなど競技FPSをプレイしたい方","高フレームレートで滑らかなゲームプレイを楽しみたい方","ゲーム配信・録画も将来的に視野に入れている方")
    "mmo"      = @("FF14・原神・ドラクエXなどMMO・RPGを楽しみたい方","美麗なグラフィックで世界観に没入したい方","ゲームを長時間快適にプレイしたい方")
    "stream"   = @("ゲーム実況・配信をこれから始めたい方","OBSなどの配信ソフトでゲームと配信を同時に行いたい方","高画質・安定した配信環境を構築したい方")
    "creative" = @("Premiere Pro・DaVinci Resolveで動画編集をしたい方","YouTubeやSNS向けのコンテンツを制作したい方","ゲームもしつつ動画制作もしたいクリエイター志望の方")
    "daily"    = @("テレワーク・ネット閲覧・動画視聴を快適にしたい方","PCゲームは軽めで普段使いがメインの方","はじめてゲーミングPCを購入する初心者の方")
}
$cautions = @{
    "fps"      = @("最新タイトルはアップデートでGPU負荷が増すことがあります","高fpsを維持するにはモニターのリフレッシュレートも重要です","予算が上がるほど高fpsを安定して出しやすくなります")
    "mmo"      = @("4K環境では高負荷シーンでフレームレートが落ちる場合があります","大型アップデート後にスペック要求が上がることがあります","オンラインゲームはネット回線の安定性も重要です")
    "stream"   = @("配信中はCPU・GPU・メモリに同時に負荷がかかります","配信画質はネット回線の上り速度にも大きく依存します","録画データが増えるのでストレージ容量に注意してください")
    "creative" = @("4K素材の編集にはメモリ32GB以上を推奨します","レンダリング中は長時間高負荷状態が続きます","素材保管用に外付けHDD・NASの導入も検討を")
    "daily"    = @("重量級ゲームタイトルは設定を下げる必要がある場合があります","ゲーム用途を増やす場合は将来的なアップグレードも想定を","解像度を上げる際はGPUの買い替えが必要になる場合があります")
}

# 全スラグを事前計算（重複は -2, -3 サフィックスで回避）
$slugCounters = @{}
$buildSlugMap = @{}
foreach ($b in $builds) {
    $bs   = $budgetSlug[$b.budget.ToString()]
    $base = "$($b.resolution)-$($b.usage)-$bs"
    if (-not $slugCounters.ContainsKey($base)) {
        $slugCounters[$base] = 1
        $buildSlugMap[$b.id] = $base
    } else {
        $slugCounters[$base]++
        $buildSlugMap[$b.id] = "$base-$($slugCounters[$base])"
    }
}

function Get-Slug($b) {
    return $buildSlugMap[$b.id]
}

function Get-SeoTitle($b) {
    $r = $resShort[$b.resolution]; $u = $usageLabel[$b.usage]; $bg = $budgetLabel[$b.budget.ToString()]
    return "${r} ${u}向けPC構成 ${bg}前後 $($b.gpu) | PC BUILD CHECK"
}

function Get-SeoDesc($b) {
    $u = $usageLabel[$b.usage]; $r = $resLabel[$b.resolution]; $bg = $budgetLabel[$b.budget.ToString()]
    return "${r}環境で${u}を快適に楽しめるおすすめPC構成。$($b.gpu)搭載・予算${bg}前後。CPU: $($b.cpu)、メモリ: $($b.ram)。初心者にも分かりやすく解説。"
}

function Get-Related($build, $allBuilds) {
    $bInt = [int]$build.budget
    $sameUsage = $allBuilds | Where-Object { $_.usage -eq $build.usage -and $_.id -ne $build.id } |
        Sort-Object { [Math]::Abs([int]$_.budget - $bInt) } | Select-Object -First 2
    $sameRes = $allBuilds | Where-Object { $_.resolution -eq $build.resolution -and $_.usage -ne $build.usage -and $_.id -ne $build.id } |
        Sort-Object { [Math]::Abs([int]$_.budget - $bInt) } | Select-Object -First 2
    $seen = @{}; $result = @()
    foreach ($item in (@($sameUsage) + @($sameRes))) {
        if ($null -ne $item -and -not $seen.ContainsKey($item.id) -and $result.Count -lt 3) {
            $seen[$item.id] = $true; $result += $item
        }
    }
    return $result
}

function Build-RelatedHtml($related) {
    if ($related.Count -eq 0) { return "" }
    $html = ""
    foreach ($r in $related) {
        $rs = Get-Slug $r
        $rRes = $resShort[$r.resolution]; $rU = $usageLabel[$r.usage]; $rBg = $budgetLabel[$r.budget.ToString()]
        $html += "
          <a href=""$rs.html"" class=""related-build-card"">
            <div class=""related-build-meta"">$rRes · $rU · ${rBg}前後</div>
            <h3>$($r.title)</h3>
            <div class=""related-build-gpu"">$($r.gpu)</div>
          </a>"
    }
    return $html
}

function Build-Html($build, $allBuilds) {
    $slug      = Get-Slug $build
    $seoTitle  = Get-SeoTitle $build
    $seoDesc   = Get-SeoDesc $build
    $canonical = "$SITE_BASE/builds/$slug.html"
    $gpuGuide  = "https://sippo-pc.jp/gpu-guide/?gpu=$([Uri]::EscapeDataString($build.gpu))"
    $bgLabel   = $budgetLabel[$build.budget.ToString()]
    $resStr    = $resLabel[$build.resolution]
    $usageStr  = $usageLabel[$build.usage]
    $related   = Get-Related $build $allBuilds
    $relHtml   = Build-RelatedHtml $related

    $suitedHtml  = ($suitedFor[$build.usage]  | ForEach-Object { "          <li>$_</li>" }) -join "`n"
    $cautionHtml = ($cautions[$build.usage] | ForEach-Object { "          <li>$_</li>" }) -join "`n"

    $relSection = ""
    if ($related.Count -gt 0) {
        $relSection = @"

      <section class="build-related-section">
        <p class="section-label">Related Builds</p>
        <h2>関連するおすすめ構成</h2>
        <div class="build-related-grid">$relHtml
        </div>
      </section>
"@
    }

    return @"
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>$seoTitle</title>
  <meta name="description" content="$seoDesc" />
  <link rel="canonical" href="$canonical" />
  <meta property="og:title" content="$seoTitle" />
  <meta property="og:description" content="$seoDesc" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="$canonical" />
  <meta property="og:image" content="$SITE_BASE/ogp.jpg" />
  <meta property="og:site_name" content="PC BUILD CHECK" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="$seoTitle" />
  <meta name="twitter:description" content="$seoDesc" />
  <meta name="twitter:image" content="$SITE_BASE/ogp.jpg" />
  <link rel="icon" type="image/x-icon" href="../icons/favicon.ico" />
  <link rel="icon" type="image/png" sizes="32x32" href="../icons/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="../icons/favicon-16x16.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="../icons/apple-touch-icon.png" />
  <link rel="manifest" href="../manifest.json" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="preload" href="../style.css" as="style" />
  <link rel="preload" href="../builds.css" as="style" />
  <link rel="stylesheet" href="../style.css" />
  <link rel="stylesheet" href="../builds.css" />
  <script>if('serviceWorker'in navigator)window.addEventListener('load',function(){navigator.serviceWorker.register('../sw.js').catch(function(){});});</script>
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="../index.html" class="site-logo">PC BUILD <span>CHECK</span></a>
      <nav class="header-nav">
$sippoHeaderLink
        <a href="../index.html#diagnosis" class="header-link">診断する</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="build-page-hero">
      <div class="container">
        <nav class="build-breadcrumb" aria-label="パンくずリスト">
          <a href="../index.html">PC BUILD CHECK</a>
          <span aria-hidden="true">›</span>
          <a href="../index.html#popular-builds">人気構成</a>
          <span aria-hidden="true">›</span>
          <span>$($build.title)</span>
        </nav>
        <div class="build-page-tags">
          <span class="build-tag">$resStr</span>
          <span class="build-tag">${usageStr}向け</span>
          <span class="build-tag">${bgLabel}前後</span>
        </div>
        <h1 class="build-page-title">$($build.title)</h1>
        <p class="build-page-subtitle">$seoDesc</p>
      </div>
    </section>

    <div class="container build-page-content">

      <section class="build-card">
        <p class="section-label">Recommended Build</p>
        <h2>おすすめ構成スペック</h2>
        <ul class="build-spec-list">
          <li><span class="spec-key">CPU</span><span class="spec-val">$($build.cpu)</span></li>
          <li><span class="spec-key">GPU（グラボ）</span><span class="spec-val">$($build.gpu)</span></li>
          <li><span class="spec-key">メモリ</span><span class="spec-val">$($build.ram)</span></li>
          <li><span class="spec-key">ストレージ</span><span class="spec-val">$($build.storage)</span></li>
          <li><span class="spec-key">予算目安</span><span class="spec-val spec-budget">${bgLabel}前後</span></li>
        </ul>
      </section>

      <section class="build-card">
        <p class="section-label">Build Points</p>
        <h2>構成のポイント</h2>
        <p class="build-comment">$($build.comment)</p>
      </section>

      <section class="build-card">
        <p class="section-label">For You</p>
        <h2>こんな方におすすめ</h2>
        <ul class="build-check-list">
$suitedHtml
        </ul>
      </section>

      <section class="build-card build-caution-card">
        <p class="section-label">Notice</p>
        <h2>購入前の注意点</h2>
        <ul class="build-caution-list">
$cautionHtml
        </ul>
      </section>

      <section class="build-card build-next-card">
        <p class="section-label">Next Step</p>
        <h2>次のステップ</h2>
        <div class="build-next-grid">
          <a href="$gpuGuide" target="_blank" rel="noopener" class="build-next-btn">
            <span class="build-next-icon">🔍</span>
            <div class="build-next-text">
              <strong>$($build.gpu) の詳細を見る</strong>
              <small>GPU GUIDEでスペック・比較を確認</small>
            </div>
          </a>
          <a href="https://sippo-pc.jp/game-pc-guide/" target="_blank" rel="noopener" class="build-next-btn">
            <span class="build-next-icon">🎮</span>
            <div class="build-next-text">
              <strong>ゲーム別おすすめPCを見る</strong>
              <small>遊びたいゲームから逆引きで確認</small>
            </div>
          </a>
          <a href="../index.html#diagnosis" class="build-next-btn">
            <span class="build-next-icon">🎯</span>
            <div class="build-next-text">
              <strong>PC構成診断をやり直す</strong>
              <small>条件を変えて別の構成も確認できます</small>
            </div>
          </a>
        </div>
      </section>
$relSection
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>&copy; 2026 PC BUILD CHECK</p>
    </div>
  </footer>
</body>
</html>
"@
}

# --- Main ---

if (-not (Test-Path "./builds")) {
    New-Item -ItemType Directory -Path "./builds" | Out-Null
    Write-Host "Created: ./builds/"
}

$count = 0
foreach ($build in $builds) {
    $slug    = Get-Slug $build
    $html    = Build-Html $build $builds
    $outPath = "./builds/$slug.html"
    [System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\builds\$slug.html", $html, [System.Text.Encoding]::UTF8)
    $count++
    Write-Host "[$count/$($builds.Count)] $outPath"
}

# Update sitemap.xml
$urlEntries = $builds | ForEach-Object {
    $s = Get-Slug $_
    "  <url>`n    <loc>$SITE_BASE/builds/$s.html</loc>`n    <changefreq>monthly</changefreq>`n    <priority>0.7</priority>`n  </url>"
}
$sitemap = "<?xml version=`"1.0`" encoding=`"UTF-8`"?>`n<urlset xmlns=`"http://www.sitemaps.org/schemas/sitemap/0.9`">`n  <url>`n    <loc>$SITE_BASE/</loc>`n    <changefreq>weekly</changefreq>`n    <priority>1.0</priority>`n  </url>`n" + ($urlEntries -join "`n") + "`n</urlset>"
[System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\sitemap.xml", $sitemap, [System.Text.Encoding]::UTF8)

Write-Host ""
Write-Host "Done! $count pages generated in ./builds/"
Write-Host "Updated: sitemap.xml ($($builds.Count + 1) URLs)"
