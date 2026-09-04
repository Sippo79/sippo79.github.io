# =========================
# PC BUILD CHECK - 個別構成ページ生成スクリプト
# 実行: PowerShellで .\generate-builds.ps1
# =========================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$builds    = Get-Content -Raw -Path "./builds.json" -Encoding UTF8 | ConvertFrom-Json
$SITE_BASE = "https://sippo-pc.jp/pc-build-check"

# ---------------------------------------------------------------------
#  GPU名 → GPU GUIDE 個別ページURL
# ---------------------------------------------------------------------
#  Phase 2 で GPU 個別ページを静的化した（/gpu-guide/gpu/<id>/）。
#  それ以前は /gpu-guide/?gpu=<GPU名> へ飛ばしていたが、GPU GUIDE トップは
#  このクエリを解釈しないため、ユーザーはGPU一覧に着地して目的のGPUを
#  自分で探し直す必要があった。生成時にidを解決して直リンクする。
#
#  ★対応表をここに手書きしない。gpus.json を唯一の情報源にする。
#    正規化規則は shared/gpu/gpu-links.js と同じ
#    （小文字化 → GeForce/Radeon/AMD 接頭辞を除去 → 英数字以外を除去）。
#    ズレると「一覧では出るのにリンクが解決しない」が起きるので必ず揃える。
$gpuCatalog = Get-Content -Raw -Path "../gpu-guide/gpus.json" -Encoding UTF8 | ConvertFrom-Json

function Get-GpuKey($value) {
    if ($null -eq $value) { return "" }
    $s = ([string]$value).ToLowerInvariant()
    $s = $s -replace '^geforce\s+', ''
    $s = $s -replace '^amd\s+radeon\s+', ''
    $s = $s -replace '^radeon\s+', ''
    $s = $s -replace '^amd\s+', ''
    return ($s -replace '[^a-z0-9]', '')
}

$gpuKeyToId = @{}
foreach ($g in $gpuCatalog) {
    if ($g.id) {
        $gpuKeyToId[(Get-GpuKey $g.id)] = $g.id
        if ($g.name) { $gpuKeyToId[(Get-GpuKey $g.name)] = $g.id }
    }
}

# ---------------------------------------------------------------------
#  構成の参考価格
# ---------------------------------------------------------------------
#  価格の計算式をここに書き写さない。診断画面と静的ページで数字が食い違うと
#  「診断では約24万円、ページでは約26万円」のような矛盾が起きるため、
#  shared/parts/build-price.js を node 経由で呼び、計算を1か所に保つ。
#
#  node が無い環境では価格を出さないだけで、ページ生成そのものは通す
#  （それらしい概算をPowerShell側で作ると、まさに二重管理になる）。
$buildPrices = @{}
$buildPriceOver = @{}
try {
    $priceJson = & node "./compute-prices.js" 2>$null
    if ($LASTEXITCODE -eq 0 -and $priceJson) {
        foreach ($row in ($priceJson | ConvertFrom-Json)) {
            $buildPrices[[string]$row.id]    = $row.text
            $buildPriceOver[[string]$row.id] = $row.overText
        }
        Write-Host "参考価格: $($buildPrices.Count) 件を算出"
    } else {
        Write-Host "参考価格: 算出できなかったため価格表示なしで生成します"
    }
} catch {
    Write-Host "参考価格: node 実行に失敗したため価格表示なしで生成します"
}

# そのGPUが中古前提のモデルか（gpus.json の market が唯一の判定材料）。
# ここでGPU名を列挙しない。データが変わったら自動で追従させる。
function Test-UsedMarketGpu($gpuName) {
    $id = $gpuKeyToId[(Get-GpuKey $gpuName)]
    if (-not $id) { return $false }
    $gpu = $gpuCatalog | Where-Object { $_.id -eq $id } | Select-Object -First 1
    return ($null -ne $gpu -and $gpu.market -eq 'used')
}

# 解決できたら個別ページURL、できなければ GPU GUIDE トップ。
# （間違ったGPUページへ飛ばすくらいなら一覧へ送る）
function Get-GpuGuideUrl($gpuName) {
    $id = $gpuKeyToId[(Get-GpuKey $gpuName)]
    if ($id) { return "https://sippo-pc.jp/gpu-guide/gpu/$id/" }
    Write-Host "  [warn] GPU '$gpuName' の個別ページが見つかりません。GPU GUIDEトップへリンクします。"
    return "https://sippo-pc.jp/gpu-guide/"
}

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
# $slugBaseCount で各baseの総数を数え、2件以上ある base（=解像度×用途×予算×GPU
# まで同じでCPU等だけ違う重複構成）を衝突として記録する。衝突ページは title に
# CPU を足して一意化し、重複コンテンツ扱いを避ける。
$slugCounters   = @{}
$buildSlugMap   = @{}
$slugBaseCount  = @{}
$buildBaseMap   = @{}
foreach ($b in $builds) {
    $bs   = $budgetSlug[$b.budget.ToString()]
    $base = "$($b.resolution)-$($b.usage)-$bs"
    $buildBaseMap[$b.id] = $base
    if ($slugBaseCount.ContainsKey($base)) { $slugBaseCount[$base]++ } else { $slugBaseCount[$base] = 1 }
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

function Test-SlugCollision($b) {
    return ($slugBaseCount[$buildBaseMap[$b.id]] -gt 1)
}

function Get-SeoTitle($b) {
    $r = $resShort[$b.resolution]; $u = $usageLabel[$b.usage]; $bg = $budgetLabel[$b.budget.ToString()]
    # 同一スラグ衝突ページ（title/解像度/用途/予算/GPUが同じ）は CPU を足して一意化。
    if (Test-SlugCollision $b) {
        return "${r} ${u}向けPC構成 ${bg}前後 $($b.gpu)（$($b.cpu)） | PC BUILD CHECK"
    }
    return "${r} ${u}向けPC構成 ${bg}前後 $($b.gpu) | PC BUILD CHECK"
}

function Get-SeoDesc($b) {
    $u = $usageLabel[$b.usage]; $r = $resLabel[$b.resolution]; $bg = $budgetLabel[$b.budget.ToString()]
    return "${r}環境で${u}を快適に楽しめるおすすめPC構成。$($b.gpu)搭載・予算${bg}前後。CPU: $($b.cpu)、メモリ: $($b.ram)。初心者にも分かりやすく解説。"
}

# H1（画面見出し）を一意にする。builds.json の title は解像度×用途で重複する
# ことがあるため、CPU・GPU・予算を添えて他ページと確実に区別できる文言にする。
# 同一スラグの衝突ページ（例 4k-creative-30man と -2）はCPUだけが違うため、
# CPUを含めることで重複コンテンツ扱いを避ける。
# 例: 「FHD 普段使い向け 定番候補｜Ryzen 5 5500 / Radeon RX 6600 / 10万円前後」
function Get-PageHeading($b) {
    $bg = $budgetLabel[$b.budget.ToString()]
    return "$($b.title)｜$($b.cpu) / $($b.gpu) / ${bg}前後"
}

# ページ固有の導入文。GPU・CPU・メモリ・解像度・予算はページごとに異なるため、
# テンプレの重複本文に対して独自性を持たせるリード文を1段落生成する。
function Get-IntroText($b) {
    $u = $usageLabel[$b.usage]; $r = $resLabel[$b.resolution]; $bg = $budgetLabel[$b.budget.ToString()]
    return "予算${bg}前後で${u}向けのPCを組むなら、$($b.gpu)を中心に、CPUは$($b.cpu)、メモリ$($b.ram)、ストレージ$($b.storage)という構成が扱いやすい候補です。$($b.gpu)は${r}での${u}に狙いを定めたバランスで、価格と性能の折り合いをつけやすいのが特徴です。以下でこの構成の狙いと、購入前に確認しておきたいポイントを解説します。"
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

function Build-MotherboardGuideHtml($build) {
    $guide = $build.motherboardGuide
    if ($null -eq $guide) {
        return @"

      <section class="build-card build-motherboard-card">
        <p class="section-label">Motherboard</p>
        <h2>マザーボード目安</h2>
        <p class="build-motherboard-fallback">CPUに対応したソケットの製品を選択してください。</p>
        <p class="build-motherboard-note">※マザーボードはCPUソケット・チップセット・メモリ規格の互換性を確認してください。</p>
      </section>
"@
    }

    return @"

      <section class="build-card build-motherboard-card">
        <p class="section-label">Motherboard</p>
        <h2>マザーボード目安</h2>
        <dl class="build-motherboard-list">
          <div><dt>ソケット</dt><dd>$($guide.socket)</dd></div>
          <div><dt>チップセット</dt><dd>$($guide.chipset)</dd></div>
          <div><dt>メモリ規格</dt><dd>$($guide.memoryType)</dd></div>
          <div><dt>注意点</dt><dd>$($guide.note)</dd></div>
        </dl>
        <p class="build-motherboard-note">※マザーボードはCPUソケット・チップセット・メモリ規格の互換性を確認してください。同じチップセットでもDDR4版とDDR5版があるため、メモリ規格に注意してください。</p>
      </section>
"@
}

# 参考価格ブロック。金額と文言は compute-prices.js（= shared/parts/build-price.js）
# が作ったものをそのまま貼るだけで、ここで組み立て直さない。
# 価格が取れなかった構成では、この節ごと出さない。
function Build-PriceHtml($build) {
    $key = [string]$build.id
    if (-not $buildPrices.ContainsKey($key)) { return "" }
    $text = $buildPrices[$key]
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }

    $overText = $buildPriceOver[$key]
    $isOver   = -not [string]::IsNullOrWhiteSpace($overText)
    $overHtml = ""
    $overCls  = ""
    if ($isOver) {
        $overCls  = " price-estimate--over"
        $overHtml = @"

        <p class="price-estimate-over">
          <span class="price-estimate-over-icon" aria-hidden="true">⚠️</span>
          $overText
        </p>
"@
    }

    return @"

      <section class="build-card price-estimate$overCls">
        <p class="section-label">Reference Price</p>
        <h2>構成の参考価格</h2>
        <div class="price-estimate-head">
          <strong class="price-estimate-value">$text</strong>
        </div>$overHtml
        <p class="price-estimate-note">※価格は販売店・時期によって変動します。同等構成のBTO完成品のおおよその価格帯を示す目安で、特定商品の販売価格ではありません。</p>
      </section>
"@
}

function Build-Html($build, $allBuilds) {
    $slug      = Get-Slug $build
    $seoTitle  = Get-SeoTitle $build
    $seoDesc   = Get-SeoDesc $build
    $pageH1    = Get-PageHeading $build
    $introText = Get-IntroText $build
    $canonical = "$SITE_BASE/builds/$slug.html"
    $gpuGuide  = Get-GpuGuideUrl $build.gpu
    $bgLabel   = $budgetLabel[$build.budget.ToString()]
    $resStr    = $resLabel[$build.resolution]
    $usageStr  = $usageLabel[$build.usage]
    $related   = Get-Related $build $allBuilds
    $relHtml   = Build-RelatedHtml $related
    $motherboardHtml = Build-MotherboardGuideHtml $build
    $priceHtml = Build-PriceHtml $build

    $suitedHtml  = ($suitedFor[$build.usage]  | ForEach-Object { "          <li>$_</li>" }) -join "`n"
    $cautionItems = @($cautions[$build.usage])

    # 中古前提のGPUを新品構成として出す場合は、その事実を注意点に足す。
    # GPU GUIDE は現行/中古の両方を載せる情報データベースだが、
    # PC BUILD CHECK は「これから買うPCの構成」を出す場所なので、
    # 黙って中古前提GPUを提示すると「新品が見つからない」食い違いになる。
    # 構成を差し替えるのではなく事実を伝える（判定は gpus.json の market）。
    if (Test-UsedMarketGpu $build.gpu) {
        $cautionItems += "$($build.gpu)は新品での流通が少なく、中古で探すのが前提のグラボです（状態・保証・相場を確認してください）"
    }

    $cautionHtml = ($cautionItems | ForEach-Object { "          <li>$_</li>" }) -join "`n"

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
  <link rel="stylesheet" href="/shared/affiliate/affiliate.css">
  <link rel="stylesheet" href="../builds.css" />
  <script>if('serviceWorker'in navigator)window.addEventListener('load',function(){navigator.serviceWorker.register('../sw.js').catch(function(){});});</script>
  <script type="application/ld+json">
  {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "PC BUILD CHECK", "item": "https://sippo-pc.jp/pc-build-check/"}, {"@type": "ListItem", "position": 2, "name": "人気構成", "item": "https://sippo-pc.jp/pc-build-check/#popular-builds"}, {"@type": "ListItem", "position": 3, "name": "$($build.title)"}]}
  </script>

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-NDQ8GTKGHC"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-NDQ8GTKGHC');
  </script>

</head>
<body data-sippo-theme="dark">
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
        <h1 class="build-page-title">$pageH1</h1>
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
$priceHtml

      <section class="build-card">
        <p class="section-label">Build Points</p>
        <h2>構成のポイント</h2>
        <p class="build-intro">$introText</p>
        <p class="build-comment">$($build.comment)</p>
      </section>
$motherboardHtml

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
          <a href="https://sippo-pc.jp/game-pc-guide/" class="build-next-btn">
            <span class="build-next-icon">🎮</span>
            <div class="build-next-text">
              <strong>ゲーム別おすすめPCを見る</strong>
              <small>遊びたいゲームから逆引きで確認</small>
            </div>
          </a>
          <a href="https://sippo-pc.jp/upgrade/" class="build-next-btn">
            <span class="build-next-icon">🔧</span>
            <div class="build-next-text">
              <strong>今のPCを活かせるか調べる</strong>
              <small>買い替えずパーツ交換で足りるか診断</small>
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
      <p class="site-footer__affiliate-note">当サイトはアフィリエイト広告（Amazonアソシエイト・楽天アフィリエイト等）を利用しています。リンク先で商品を購入すると運営者に収益が発生する場合があります。Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。</p>
      <p>&copy; 2026 PC BUILD CHECK</p>
    </div>
  </footer>
  <!-- 共通アフィリエイト基盤（shared/affiliate）。設定→本体→利用側の順 -->
  <script src="/shared/affiliate/affiliate-config.js"></script>
  <script src="/shared/affiliate/affiliate.js"></script>
  <script src="../build-affiliate.js"></script>
</body>
</html>
"@
}

# --- 廃止スラグ（統合先へ寄せるページ）---
#
# builds.json の整理でページが1枚に統合されたとき、古いURLを消すと
# 既にインデックスされている検索結果が 404 になる。ファイルは残し、
# canonical を統合先へ向けた案内ページに置き換えてリンクを引き継ぐ。
# sitemap には載せない（正規URLは統合先の1本だけ）。
#
#   キー   … 廃止するスラグ
#   値     … 統合先のスラグ
#
# 2026-09-02: 4k-creative-30man と -2 はCPU違い（Ryzen 9 7900 / 7900X）
#             だけの重複で、診断からは -2 に到達できなかった。
#             重複を解消し 4k-creative-30man へ統合。
$retiredSlugs = @{
    "4k-creative-30man-2" = "4k-creative-30man"
}

function Build-RetiredHtml($fromSlug, $toSlug) {
    $toUrl = "$SITE_BASE/builds/$toSlug.html"
    return @"
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>この構成は統合されました | PC BUILD CHECK</title>
  <meta name="description" content="この構成ページは同じ内容のページへ統合されました。最新の内容は統合先のページでご確認ください。" />
  <link rel="canonical" href="$toUrl" />
  <meta name="robots" content="noindex, follow" />
  <meta http-equiv="refresh" content="0; url=$toUrl" />
  <link rel="icon" type="image/x-icon" href="../icons/favicon.ico" />
  <link rel="stylesheet" href="../style.css" />
  <link rel="stylesheet" href="../builds.css" />
</head>
<body>
  <main class="build-page">
    <div class="container">
      <p class="section-label">Moved</p>
      <h1 class="build-page-title">この構成ページは統合されました</h1>
      <p>同じ内容のページにまとめました。数秒で移動します。移動しない場合は下のリンクからどうぞ。</p>
      <p><a class="primary-btn" href="$toUrl">統合先のページを見る →</a></p>
      <p><a href="../index.html">PC BUILD CHECK トップへ戻る</a></p>
    </div>
  </main>
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

# 廃止スラグを統合先への案内ページに置き換える（sitemapには載せない）
foreach ($from in $retiredSlugs.Keys) {
    $to = $retiredSlugs[$from]
    $retiredHtml = Build-RetiredHtml $from $to
    [System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\builds\$from.html", $retiredHtml, [System.Text.Encoding]::UTF8)
    Write-Host "[retired] ./builds/$from.html -> $to.html"
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
