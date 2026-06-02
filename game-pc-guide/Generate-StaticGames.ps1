$ErrorActionPreference = "Stop"

$baseUrl = "https://sippo79.github.io/game-pc-guide"
$today = "2026-05-29"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$gamesDir = Join-Path $root "games"
$dataPath = Join-Path $root "data\games.json"

if (-not (Test-Path $gamesDir)) {
  New-Item -ItemType Directory -Path $gamesDir | Out-Null
}

function Escape-Html([string]$value) {
  if ($null -eq $value) {
    return ""
  }

  return [System.Net.WebUtility]::HtmlEncode($value)
}

function Get-Slug($game) {
  if ($game.id -eq "mhwilds") {
    return "monster-hunter"
  }

  return $game.id
}

function Get-SeoTitle($game) {
  switch ($game.id) {
    "apex" { return "Apex Legends おすすめPC｜144fps向けゲーミングPC構成" }
    "valorant" { return "VALORANT おすすめPC｜144fps・240fps向けゲーミングPC構成" }
    "ff14" { return "FF14 おすすめPC｜初心者向けゲーミングPC構成" }
    "mhwilds" { return "モンハンワイルズ おすすめPC｜快適に遊べるゲーミングPC構成" }
    default { return "$($game.title) おすすめPC｜必要スペックと快適に遊べる構成" }
  }
}

function Get-MetaDescription($game) {
  switch ($game.id) {
    "apex" { return "Apex LegendsをフルHD・144fpsで快適に遊ぶためのおすすめゲーミングPC構成を初心者向けに紹介。必要スペックや予算目安もわかります。" }
    "valorant" { return "VALORANTを144fpsから240fpsで快適に遊ぶためのおすすめゲーミングPC構成を紹介。低予算で選びやすい必要スペックや予算目安を解説します。" }
    "ff14" { return "FF14を高画質で快適に遊ぶためのおすすめゲーミングPC構成を初心者向けに紹介。必要スペック、予算目安、選び方のポイントがわかります。" }
    "mhwilds" { return "モンハンワイルズを快適に遊ぶためのおすすめゲーミングPC構成を紹介。重めのゲームに必要なスペックやGPU選び、予算目安を解説します。" }
    default { return "$($game.title)を快適に遊ぶためのおすすめゲーミングPC構成を紹介。必要スペック、予算目安、選び方のポイントを初心者向けにわかりやすく解説します。" }
  }
}

function Get-SpecText($game) {
  switch ($game.level) {
    "軽い" { return "$($game.title)は必要スペックが控えめなタイトルです。FHDならエントリー寄りのGPUでも遊びやすいですが、144fps以上を安定させたい場合はCPU性能とメモリ16GB以上を意識しましょう。" }
    "軽め" { return "$($game.title)は比較的軽く、低予算PCでも始めやすいゲームです。高リフレッシュレート環境ではCPUの処理性能が効きやすいので、GPUだけを極端に強くするよりバランス重視がおすすめです。" }
    "軽め〜中量級" { return "$($game.title)は設定次第で負荷が変わります。FHDならミドル手前のGPUで十分狙えますが、144fps以上やWQHDを考えるならCPUとGPUの両方に余裕を持たせると安定します。" }
    "中量級" { return "$($game.title)は標準的なゲーミングPCなら遊びやすい一方、高画質や高fpsではGPU性能が必要になります。FHDを基準に、WQHDまで見据えるならミドルクラス以上を選ぶと安心です。" }
    "中量級〜重め" { return "$($game.title)は場面や設定で負荷が上がりやすいタイトルです。FHDでも余裕のあるGPU、メモリ16GB以上、マルチプレイや長時間プレイを考えるなら32GBも候補に入ります。" }
    "重め" { return "$($game.title)は軽いゲーム向けPCだと設定調整が必要になりやすいタイトルです。FHDでもミドルクラス以上のGPUを目安にし、重い場面でfpsを落としにくいCPUを組み合わせましょう。" }
    "超重い" { return "$($game.title)はPCへの負荷がかなり高いゲームです。快適さを重視するならGPU性能を最優先にしつつ、CPU、メモリ、冷却にも余裕を持たせた構成が向いています。" }
    default { return "$($game.title)を快適に遊ぶには、解像度、画質設定、目標fpsに合わせたPCスペック選びが大切です。まずはFHDで遊ぶのか、WQHDや4Kまで狙うのかを決めましょう。" }
  }
}

function Get-ResolutionRows($game) {
  switch ($game.level) {
    "軽い" {
      return @(
        @{ label = "FHD"; text = "10万〜12万円前後の入門構成でも快適。144fps以上を狙うならCPUも少し余裕を持たせます。" },
        @{ label = "WQHD"; text = "12万〜18万円前後が目安。画質よりfps安定を優先すると満足しやすいです。" },
        @{ label = "4K"; text = "ゲーム自体は軽めでも4KはGPU負荷が増えます。優先度は低めで、配信や他ゲームも遊ぶ人向けです。" }
      )
    }
    "軽め" {
      return @(
        @{ label = "FHD"; text = "12万円前後から狙いやすい解像度。144Hzモニターと組み合わせると体感が大きく変わります。" },
        @{ label = "WQHD"; text = "16万〜20万円前後が目安。高fps重視ならCPUもミドル以上にしておくと安定します。" },
        @{ label = "4K"; text = "画質目的なら可能ですが、競技性を重視するならFHD〜WQHDの高fps構成が現実的です。" }
      )
    }
    "軽め〜中量級" {
      return @(
        @{ label = "FHD"; text = "12万〜18万円前後が目安。144fpsを狙うならミドル寄りのCPUとGPUが扱いやすいです。" },
        @{ label = "WQHD"; text = "18万〜24万円前後が目安。画質とfpsを両立しやすく、長く使うならおすすめです。" },
        @{ label = "4K"; text = "4K高画質は負荷が上がるため、画質重視なら上位GPU、fps重視ならWQHDまでが選びやすいです。" }
      )
    }
    "中量級" {
      return @(
        @{ label = "FHD"; text = "15万円前後から快適に狙えます。高画質でも遊びやすく、初心者の基準にしやすい解像度です。" },
        @{ label = "WQHD"; text = "20万〜25万円前後が目安。映像の綺麗さと快適さのバランスが良い構成です。" },
        @{ label = "4K"; text = "4Kは上位GPU推奨。画質を上げるほどfpsが落ちやすいので、DLSSなどの支援機能も確認しましょう。" }
      )
    }
    "中量級〜重め" {
      return @(
        @{ label = "FHD"; text = "15万〜20万円前後が現実的な入門ライン。重い場面に備えてメモリ容量にも余裕を持たせます。" },
        @{ label = "WQHD"; text = "22万〜28万円前後が目安。高画質やマルチプレイまで考えるならこの帯が安心です。" },
        @{ label = "4K"; text = "4KはかなりGPU依存になります。高画質で遊ぶならハイエンド寄りの構成を検討しましょう。" }
      )
    }
    "重め" {
      return @(
        @{ label = "FHD"; text = "18万〜22万円前後が目安。画質調整を減らしたいならミドル以上のGPUを選びたいです。" },
        @{ label = "WQHD"; text = "25万〜30万円前後が目安。高画質で遊ぶならGPU性能とVRAM容量を重視しましょう。" },
        @{ label = "4K"; text = "4Kはハイエンド構成向け。最高設定にこだわるより、画質設定を調整してfpsを確保するのが現実的です。" }
      )
    }
    "超重い" {
      return @(
        @{ label = "FHD"; text = "20万円台前半が最低ラインになりやすいです。画質調整前提でもGPU性能は妥協しすぎないようにします。" },
        @{ label = "WQHD"; text = "30万円前後が目安。高画質で安定させるには上位GPUと余裕のあるCPUが欲しいところです。" },
        @{ label = "4K"; text = "4K高画質はハイエンドPC向け。レイトレーシングや高設定を使うなら最上位クラスのGPUを検討しましょう。" }
      )
    }
    default {
      return @(
        @{ label = "FHD"; text = "まずはFHDが選びやすい基準です。予算を抑えつつ快適さを確保しやすい解像度です。" },
        @{ label = "WQHD"; text = "WQHDは画質と快適さのバランスが良く、少し余裕のあるゲーミングPCに向いています。" },
        @{ label = "4K"; text = "4KはGPU負荷が高いため、予算と画質設定のバランスを見て選びましょう。" }
      )
    }
  }
}

function Get-GpuText($game) {
  switch ($game.level) {
    "軽い" { return "$($game.title)だけなら高額GPUは必須ではありません。RTX 3050〜RTX 5050級を入口に、240Hz環境や配信も考えるならRTX 5060以上を目安にすると選びやすいです。" }
    "軽め" { return "$($game.title)ではGPUを盛りすぎるより、CPUやモニターとのバランスが重要です。FHD中心ならRTX 5050〜RTX 5060級、余裕を見たいならRTX 5060 Ti以上が候補です。" }
    "軽め〜中量級" { return "$($game.title)はFHD高fpsならRTX 5060級、WQHDも視野に入れるならRTX 5070級が扱いやすい目安です。4Kより高fpsを優先した方が快適に感じやすいです。" }
    "中量級" { return "$($game.title)をFHD高画質で遊ぶならRTX 5060級、WQHDまで狙うならRTX 5070級が候補になります。VRAM容量も確認しておくと長く使いやすいです。" }
    "中量級〜重め" { return "$($game.title)は負荷が上がる場面に備えてRTX 5060 Ti〜RTX 5070級を見ておくと安心です。拠点、マルチ、MOD要素がある場合はVRAMとメモリ容量も大切です。" }
    "重め" { return "$($game.title)ではRTX 5060 Ti以上を入口に、WQHD高画質ならRTX 5070〜RTX 5070 Ti級が選びやすいです。GPU性能に余裕があるほど画質調整の幅が広がります。" }
    "超重い" { return "$($game.title)はGPU性能が快適さに直結します。FHDでもRTX 5070級、WQHD〜4KではRTX 5080級以上を検討すると画質とfpsの両立がしやすくなります。" }
    default { return "$($game.title)向けGPUは、FHDならミドルクラス、WQHD以上なら上位クラスを目安に選ぶと失敗しにくいです。" }
  }
}

function Get-BeginnerText($game) {
  switch ($game.genre) {
    "FPS" { return "$($game.title)では平均fpsだけでなく、戦闘中にfpsが落ちにくいことも大切です。144Hz以上のモニターを使う場合は、PC本体だけでなくモニター設定と映像ケーブルも確認しましょう。" }
    "TPS" { return "$($game.title)は戦闘中のエフェクトで負荷が上がることがあります。初めて選ぶなら最高設定前提にせず、少し設定を下げても安定する構成を選ぶと快適です。" }
    "MMO" { return "$($game.title)は人が多い場所や大型コンテンツで負荷が変わります。普段は快適でも混雑時に重くなることがあるため、CPUとメモリにも余裕を持たせましょう。" }
    "オープンワールド" { return "$($game.title)は広いマップの読み込みや高画質設定で負荷が増えます。ストレージはSSDを選び、MODや追加データを入れるなら容量にも余裕を持たせてください。" }
    "サバイバル" { return "$($game.title)は建築量やマルチプレイ環境で重くなることがあります。長く遊ぶ予定なら、最初からメモリ32GBや余裕のあるCPUを選ぶのも堅実です。" }
    "RPG" { return "$($game.title)は画質設定で体験が大きく変わります。高解像度を狙うほどGPU負荷が上がるため、予算内で無理に4Kを狙わずWQHDも候補に入れると選びやすいです。" }
    default { return "$($game.title)用PCを選ぶときは、最低スペックだけで判断しないことが大切です。快適に遊ぶには推奨スペックより少し余裕のある構成を選びましょう。" }
  }
}

function Get-DetailLead($game) {
  switch ($game.level) {
    "軽い" { return "$($game.title)はPCゲームの中では軽めですが、快適さを重視するならfpsの安定や入力遅延の少なさも大切です。" }
    "軽め" { return "$($game.title)は比較的軽めのタイトルなので、予算を抑えつつ高fpsを狙いやすいゲームです。" }
    "軽め〜中量級" { return "$($game.title)は設定次第で幅広いPC構成に対応できます。まずは遊びたい解像度とfpsを決めると選びやすくなります。" }
    "中量級" { return "$($game.title)は極端に重いゲームではありませんが、高画質や高fpsを狙うならCPUとGPUのバランスが重要です。" }
    "中量級〜重め" { return "$($game.title)は遊び方によって負荷が変わりやすいため、少し余裕のある構成を選ぶと長く快適に使えます。" }
    "重め" { return "$($game.title)は負荷が高めのゲームなので、フルHDでもGPUとCPUに余裕を持たせると安心です。" }
    "超重い" { return "$($game.title)はかなり重い部類のゲームです。画質や解像度を上げたい場合は、GPU性能をしっかり確保しましょう。" }
    default { return "$($game.title)を快適に遊ぶには、必要スペックだけでなく目標fpsや解像度に合わせた構成選びが大切です。" }
  }
}

function Convert-ImagePath([string]$path) {
  if ([string]::IsNullOrWhiteSpace($path)) {
    return ""
  }

  return "../$path"
}

$games = Get-Content -Raw -Encoding UTF8 $dataPath | ConvertFrom-Json
$createdPages = @()

foreach ($game in $games) {
  $slug = Get-Slug $game
  $fileName = "$slug.html"
  $canonical = "$baseUrl/games/$fileName"
  $imagePath = Convert-ImagePath $game.image
  $seoTitle = Get-SeoTitle $game
  $metaDescription = Get-MetaDescription $game
  $detailLead = Get-DetailLead $game
  $specText = Get-SpecText $game
  $gpuText = Get-GpuText $game
  $beginnerText = Get-BeginnerText $game
  $resolutionRows = Get-ResolutionRows $game

  $buildCards = foreach ($build in $game.builds) {
@"
            <article class="build-card">
              <p class="build-label">$(Escape-Html $build.name)</p>
              <h3>$(Escape-Html $build.target)</h3>

              <ul class="build-specs">
                <li>
                  <span>予算目安</span>
                  <strong>$(Escape-Html $build.price)</strong>
                </li>
                <li>
                  <span>CPU</span>
                  <strong>$(Escape-Html $build.cpu)</strong>
                </li>
                <li>
                  <span>GPU</span>
                  <strong>$(Escape-Html $build.gpu)</strong>
                </li>
              </ul>
              <p class="build-comment">$(Escape-Html $build.comment)</p>
            </article>
"@
  }

  $resolutionCards = foreach ($row in $resolutionRows) {
@"
            <article class="resolution-card">
              <p class="info-label">$(Escape-Html $row.label)</p>
              <h3>$(Escape-Html $row.label)で遊ぶ場合</h3>
              <p>$(Escape-Html $row.text)</p>
            </article>
"@
  }

  $html = @"
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>$(Escape-Html $seoTitle)</title>
  <meta name="description" content="$(Escape-Html $metaDescription)" />
  <link rel="canonical" href="$(Escape-Html $canonical)" />

  <meta property="og:title" content="$(Escape-Html $seoTitle)" />
  <meta property="og:description" content="$(Escape-Html $metaDescription)" />
  <meta property="og:image" content="$baseUrl/$(Escape-Html $game.image)" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="$(Escape-Html $canonical)" />
  <meta name="twitter:card" content="summary_large_image" />

  <link rel="stylesheet" href="../style.css" />
  <link rel="icon" type="image/png" href="../images/favicon.png" />
</head>

<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="../index.html" class="site-logo">
        GAME PC <span>GUIDE</span>
      </a>

      <nav class="header-nav">
        <a href="../index.html#games" class="header-link">ゲーム一覧</a>
        <a href="../index.html#beginner" class="header-link">初心者向け</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="game-detail-hero">
      <img src="$(Escape-Html $imagePath)" alt="$(Escape-Html $game.title)" />

      <div class="container">
        <a href="../index.html#games" class="back-link">
          ← ゲーム一覧に戻る
        </a>

        <p class="hero-badge">$(Escape-Html $game.genre) / $(Escape-Html $game.level)</p>

        <h1>$(Escape-Html $game.title) おすすめPC</h1>

        <p class="hero-text">
          $(Escape-Html $game.description)
        </p>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-heading">
          <p class="section-label">RECOMMENDED BUILDS</p>
          <h2>$(Escape-Html $game.title)向けおすすめPC構成</h2>
          <p>
            $(Escape-Html $detailLead)
          </p>
        </div>

        <div class="build-grid">
$($buildCards -join "`r`n")
        </div>

        <section class="seo-guide-section" aria-labelledby="specTitle">
          <div class="section-heading">
            <p class="section-label">PC SPEC GUIDE</p>
            <h2 id="specTitle">$(Escape-Html $game.title)に必要なPCスペック</h2>
            <p>$(Escape-Html $specText)</p>
          </div>

          <div class="seo-guide-panel">
            <div>
              <p class="info-label">TARGET</p>
              <h3>まず目標にしたい環境</h3>
              <p>$(Escape-Html $game.recommended)</p>
            </div>
            <div>
              <p class="info-label">BUDGET</p>
              <h3>予算の目安</h3>
              <p>$(Escape-Html $game.budget)</p>
            </div>
          </div>
        </section>

        <section class="seo-guide-section" aria-labelledby="resolutionTitle">
          <div class="section-heading">
            <p class="section-label">RESOLUTION</p>
            <h2 id="resolutionTitle">FHD/WQHD/4K別のおすすめ構成</h2>
            <p>$(Escape-Html $game.title)は解像度を上げるほどGPU負荷が増えます。迷ったらFHDでfps重視、映像の綺麗さも欲しいならWQHDを基準にすると選びやすいです。</p>
          </div>

          <div class="resolution-grid">
$($resolutionCards -join "`r`n")
          </div>
        </section>

        <section class="seo-guide-section" aria-labelledby="gpuTitle">
          <div class="section-heading">
            <p class="section-label">GPU GUIDE</p>
            <h2 id="gpuTitle">GPU選びの目安</h2>
            <p>$(Escape-Html $gpuText)</p>
          </div>
        </section>

        <section class="seo-guide-section" aria-labelledby="beginnerCautionTitle">
          <div class="section-heading">
            <p class="section-label">BEGINNER NOTE</p>
            <h2 id="beginnerCautionTitle">初心者向けの注意点</h2>
            <p>$(Escape-Html $beginnerText)</p>
          </div>
        </section>

        <section class="affiliate-section" aria-labelledby="affiliateTitle">
          <div class="affiliate-heading">
            <p class="section-label">SHOP LINKS</p>
            <h2 id="affiliateTitle">ショップ連携準備中</h2>
            <p>現在、販売サイトへのリンクを準備しています。公開後はこのエリアから確認できます。</p>
          </div>

          <div class="affiliate-link-grid">
            <span class="affiliate-button affiliate-button-bto affiliate-button-disabled" aria-disabled="true">
              <span>このゲーム向けBTOパソコンを探す</span>
              <small>ショップ連携準備中</small>
              <em>近日対応予定</em>
            </span>
            <span class="affiliate-button affiliate-button-amazonParts affiliate-button-disabled" aria-disabled="true">
              <span>AmazonでPCパーツを見る</span>
              <small>ショップ連携準備中</small>
              <em>近日対応予定</em>
            </span>
            <span class="affiliate-button affiliate-button-rakutenParts affiliate-button-disabled" aria-disabled="true">
              <span>楽天でPCパーツを見る</span>
              <small>ショップ連携準備中</small>
              <em>近日対応予定</em>
            </span>
            <span class="affiliate-button affiliate-button-monitor affiliate-button-disabled" aria-disabled="true">
              <span>ゲーミングモニターを見る</span>
              <small>ショップ連携準備中</small>
              <em>近日対応予定</em>
            </span>
            <span class="affiliate-button affiliate-button-mouse affiliate-button-disabled" aria-disabled="true">
              <span>ゲーミングマウスを見る</span>
              <small>ショップ連携準備中</small>
              <em>近日対応予定</em>
            </span>
          </div>
        </section>

        <div class="game-info-grid">
          <section class="info-card">
            <p class="info-label">RECOMMENDED</p>
            <h3>おすすめ環境</h3>
            <p>$(Escape-Html $game.recommended)</p>
          </section>

          <section class="info-card">
            <p class="info-label">BUDGET</p>
            <h3>予算目安</h3>
            <p>$(Escape-Html $game.budget)</p>
          </section>

          <section class="info-card info-card-wide">
            <p class="info-label">POINT</p>
            <h3>選び方のポイント</h3>
            <p>$(Escape-Html $game.point)</p>
          </section>

          <section class="info-card info-card-wide">
            <p class="info-label">CAUTION</p>
            <h3>注意点</h3>
            <p>$(Escape-Html $game.caution)</p>
          </section>
        </div>

        <div class="detail-related-sites">
          <div class="related-site-grid">
            <a
              href="https://sippo79.github.io/pc-build-check/"
              class="related-site-button related-site-build"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="related-site-mini">PC BUILD CHECK</span>
              <span>PC構成診断</span>
              <small>予算や用途からおすすめPC構成をチェック</small>
            </a>

            <a
              href="https://sippo79.github.io/gpu-guide/"
              class="related-site-button related-site-gpu"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="related-site-mini">GPU GUIDE</span>
              <span>グラボ比較ガイド</span>
              <small>GPU性能や用途別の目安を比較</small>
            </a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>© GAME PC GUIDE</p>
    </div>
  </footer>
</body>
</html>
"@

  $outputPath = Join-Path $gamesDir $fileName
  Set-Content -Path $outputPath -Value $html -Encoding UTF8
  $createdPages += "games/$fileName"
}

$sitemapUrls = @("$baseUrl/")
foreach ($page in $createdPages) {
  $sitemapUrls += "$baseUrl/$page"
}

$sitemapEntries = foreach ($url in $sitemapUrls) {
@"
  <url>
    <loc>$url</loc>
    <lastmod>$today</lastmod>
  </url>
"@
}

$sitemap = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
$($sitemapEntries -join "`r`n")
</urlset>
"@

Set-Content -Path (Join-Path $root "sitemap.xml") -Value $sitemap -Encoding UTF8

Write-Host "Created $($createdPages.Count) static game pages."

