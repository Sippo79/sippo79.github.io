/* =====================================================================
 *  アップグレード解説ページ 生成スクリプト
 *  ---------------------------------------------------------------------
 *  実行: node upgrade/generate-pages.js
 *
 *  /upgrade/gpu/ などのパーツ別ページを静的HTMLとして書き出す。
 *
 *  【なぜ生成スクリプトにするか】
 *   このサイト群では、クエリURL（?id=xxx）のSPAページが
 *   検索エンジンに登録されない問題が起きている。
 *   そのためページは必ず「実体のある静的HTML」として持つ必要がある。
 *   一方で7ページ分のヘッダー・フッター・ナビを手で書くと、
 *   サービスが増えるたびに全ページを直すことになり必ず崩れる。
 *   → 共通部分をこのスクリプトに集約し、内容だけをPAGESに書く。
 *
 *   既存の pc-build-check/generate-builds.ps1 や
 *   game-pc-guide/Generate-StaticGames.ps1 と同じ運用方針。
 *
 *  ★ 生成後のHTMLを直接編集しないこと（次回生成で上書きされる）。
 *    内容を変えるときは、このファイルの PAGES を編集して再実行する。
 * ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var SITE = 'https://sippo-pc.jp';
var OUT_ROOT = path.join(__dirname);

/** HTML特殊文字をエスケープする */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =====================================================================
 *  ページ定義
 *  ---------------------------------------------------------------------
 *  slug        … /upgrade/<slug>/ になる
 *  title       … <title>（検索結果に出る。ロングテールを意識する）
 *  description … meta description
 *  h1          … ページ見出し
 *  lead        … 導入文
 *  forWho      … 「こんな人向け」
 *  notFor      … 「交換しなくていい人」★ 押し売りしないための必須項目
 *  sections    … 本文セクション [{ heading, body[], list[] }]
 *  faq         … FAQPage構造化データにも使う [{ q, a }]
 *  products    … 購入導線に出す商品ID（shared/affiliate のマスターに存在するもの）
 *  productHeading … 商品ブロックの見出し
 * ===================================================================== */
var PAGES = [
  /* ------------------------------------------------------------- GPU */
  {
    slug: 'gpu',
    title: 'GPU交換でFPSはどれくらい上がる？ゲーミングPCのグラボ交換ガイド',
    description: 'ゲームが重い原因の多くはGPUです。GPU交換で何が変わるか、交換前に確認すべき電源容量・ケースサイズ・CPUとの釣り合いを解説します。交換が不要なケースも説明します。',
    h1: 'GPU（グラフィックボード）交換',
    lead: 'ゲームのFPSに最も影響するパーツです。「ゲームが重い」の原因がここにあることは多いですが、'
        + '交換する前に確認すべき点がいくつかあります。',
    forWho: [
      'ゲームのFPSを上げたい',
      'WQHD（1440p）や4Kで遊びたい',
      '最新のゲームがカクついて遊べない',
      'レイトレーシングを有効にしたい',
      '画質設定を上げたい',
    ],
    notFor: [
      '解像度がフルHD・60fpsで足りていて、今のゲームが快適に動いている',
      'GPU使用率が100%に達していない（この場合はCPUやメモリが原因の可能性）',
      '重いのが「読み込み時間」だけ（この場合はSSDの問題）',
    ],
    sections: [
      {
        heading: 'GPU交換で変わること・変わらないこと',
        body: [
          'GPUを交換すると、ゲームのフレームレート（FPS）と対応できる解像度・画質設定が上がります。'
          + '一方で、<strong>ゲームの読み込み時間やWindowsの起動速度はほとんど変わりません</strong>。'
          + 'そちらが不満な場合はSSDの見直しが有効です。',
          'また、アプリを多数開いたときの重さはメモリ容量の問題であることが多く、'
          + 'GPUを交換しても改善しません。まず「何が遅いのか」を切り分けることが大切です。',
        ],
      },
      {
        heading: '交換前に必ず確認する3点',
        body: [
          '<strong>1. 電源容量</strong><br>'
          + '性能の高いGPUほど電力を使います。容量が足りないと、起動しない・'
          + 'ゲーム中に突然電源が落ちるといった症状が出ます。'
          + '電源ユニット本体のラベルで定格出力（○○W）を確認してください。'
          + '補助電源コネクタ（8pin / 12VHPWR）の本数も必要です。',

          '<strong>2. ケースに入るか（GPUの長さ）</strong><br>'
          + '上位のGPUは30cmを超えるものもあり、ケースに収まらないことがあります。'
          + '製品ページに記載された「カード長」と、ケースの「対応GPU長」を比べてください。'
          + '厚み（2.5スロット / 3スロット）も確認が必要です。',

          '<strong>3. CPUとの釣り合い</strong><br>'
          + 'GPUだけを大幅に強化しても、CPUが追いつかないと性能を出し切れません'
          + '（ボトルネック）。とくにフルHDの高FPSを狙う場合はCPUの影響が大きくなります。'
          + '逆にWQHD・4KではGPU側の負担が大きいため、CPUの影響は小さくなります。',
        ],
      },
      {
        heading: '解像度別・GPUの目安',
        body: [
          '同じGPUでも、解像度が上がるほど必要な性能は大きくなります。おおよその目安は次のとおりです。',
        ],
        list: [
          '<strong>フルHD / 60fps</strong>：エントリークラスでも十分に狙えます',
          '<strong>フルHD / 144fps</strong>：ミドルクラス以上。CPU性能も重要になります',
          '<strong>WQHD / 60〜120fps</strong>：ミドルハイクラスが目安です',
          '<strong>4K / 60fps</strong>：ハイエンドクラスが必要になります',
        ],
      },
      {
        heading: 'DLSS / FSRという選択肢',
        body: [
          'GPUを交換しなくても、<strong>DLSS（NVIDIA）</strong>や<strong>FSR（AMD）</strong>といった'
          + 'アップスケーリング機能を有効にすると、画質をあまり落とさずにFPSを上げられる場合があります。'
          + '対応しているゲームであれば、まずこちらを試す価値があります。',
          '「あと少しFPSが足りない」という状況なら、交換せずに解決することもあります。',
        ],
      },
    ],
    faq: [
      {
        q: 'GPUを交換したらFPSはどれくらい上がりますか？',
        a: '現在のGPUと交換先の性能差によります。性能が2倍のGPUに交換しても、CPUやゲーム側の制限で'
         + 'FPSがそのまま2倍になるとは限りません。とくにフルHDではCPUの影響が大きく、'
         + '伸びが小さくなることがあります。',
      },
      {
        q: '古いPCに最新のGPUを付けられますか？',
        a: '物理的な接続（PCI Express）には下位互換があるため、多くの場合取り付け自体は可能です。'
         + 'ただし電源容量・ケースの大きさ・CPU性能が見合っているかの確認が必要です。'
         + '古いCPUと組み合わせると、GPUの性能を出し切れない場合があります。',
      },
      {
        q: 'GPUの交換作業は難しいですか？',
        a: '手順自体は「古いGPUを外して新しいGPUを挿し、補助電源をつなぐ」というものです。'
         + 'ただし静電気対策、固定ネジやロック解除、ケーブルの取り回しなど注意点はあります。'
         + '不安な場合は作業のご相談も承っています。',
      },
    ],
    products: ['rtx5060', 'rtx5060ti', 'rtx5070', 'rx9070'],
    productHeading: '交換候補としてよく選ばれるGPU',
    related: ['cpu', 'psu', 'vs-new-pc'],
  },

  /* ------------------------------------------------------------- CPU */
  {
    slug: 'cpu',
    title: 'CPU交換は必要？ゲーミングPCのボトルネック判断と交換範囲',
    description: 'CPU交換はマザーボードやメモリの交換も伴う場合があります。本当にCPUがボトルネックなのかの見分け方と、交換範囲・費用の考え方を解説します。',
    h1: 'CPU交換',
    lead: 'CPUは「GPUの性能を引き出せているか」に関わるパーツです。'
        + 'ただし交換範囲が広がりやすく、費用が大きくなりがちなので、'
        + '本当に必要かを見極めてから判断してください。',
    forWho: [
      'GPUを交換したのにFPSが伸びなかった',
      'ゲーム配信や録画を同時に行いたい',
      '動画編集・3D制作をしている',
      'フルHDで高いFPS（144fps以上）を狙いたい',
    ],
    notFor: [
      'WQHD・4Kで遊んでいて、GPU使用率が常に高い（この場合はGPU側が先）',
      'ゲーム中のCPU使用率に余裕がある',
      '不満が「読み込みの遅さ」だけ（SSDの問題）',
    ],
    sections: [
      {
        heading: 'CPUがボトルネックかどうかの見分け方',
        body: [
          'ゲーム中にタスクマネージャー（Ctrl + Shift + Esc）を開き、'
          + '<strong>CPUとGPUの使用率</strong>を見比べてください。',
        ],
        list: [
          '<strong>GPU使用率が95〜100%</strong>：GPUが限界。CPUではなくGPUの交換が有効です',
          '<strong>GPU使用率が低くCPUが高い</strong>：CPUがボトルネックの可能性があります',
          '<strong>どちらにも余裕がある</strong>：ゲーム側の設定やメモリ、ストレージが原因かもしれません',
        ],
      },
      {
        heading: 'CPU交換は「CPUだけ」で終わらないことがある',
        body: [
          'CPUにはソケット（取り付け規格）があり、'
          + '<strong>今のマザーボードが対応していないCPUには交換できません</strong>。'
          + '世代が離れたCPUに交換する場合、マザーボードの交換が必要になります。',
          'さらにマザーボードを替えると、メモリの規格（DDR4 / DDR5）が変わることがあり、'
          + 'メモリの買い替えも発生します。'
          + 'つまり<strong>CPU + マザーボード + メモリ</strong>の3点交換になりやすく、'
          + 'ここまで来ると費用は新しいPCに近づきます。',
          'まず「今のマザーボードで載せ替えられるCPUがあるか」を確認してください。'
          + '同じソケットの上位CPUに交換できれば、費用を大きく抑えられます。',
        ],
      },
      {
        heading: 'BIOS更新が必要な場合があります',
        body: [
          '同じソケットでも、新しい世代のCPUに対応するには'
          + '<strong>マザーボードのBIOS更新</strong>が必要な場合があります。'
          + '更新せずに新しいCPUを取り付けると、そもそも起動しません。',
          'また、BIOS更新には古いCPUが必要になることが多いため、'
          + '<strong>CPUを取り外す前に更新を済ませておく</strong>のが安全です。'
          + 'メーカーの製品ページで「CPU対応表」と必要なBIOSバージョンを確認してください。',
        ],
      },
    ],
    faq: [
      {
        q: 'CPUを交換するとゲームは快適になりますか？',
        a: 'CPUがボトルネックになっている場合は改善します。しかしGPU使用率が既に100%近い場合、'
         + 'CPUを替えてもFPSはほとんど変わりません。まずどちらが限界に達しているかの確認が先です。',
      },
      {
        q: 'CPUだけ交換できますか？',
        a: '今のマザーボードが対応しているCPUであれば、CPUだけの交換が可能です。'
         + '対応表とBIOSバージョンを確認してください。対応していない場合はマザーボード、'
         + '場合によってはメモリの交換も必要になります。',
      },
      {
        q: 'ゲーム用ならコア数が多いほど良いですか？',
        a: 'いいえ。多くのゲームは限られたコア数しか使わないため、'
         + 'コア数よりも1コアあたりの性能やキャッシュ容量が効きます。'
         + '配信や動画編集を同時に行う場合はコア数が活きます。',
      },
    ],
    products: ['ryzen75700x3d', 'ryzen77800x3d', 'corei514600kf'],
    productHeading: 'ゲーム用途で選ばれることが多いCPU',
    related: ['gpu', 'cooler', 'vs-new-pc'],
  },

  /* ---------------------------------------------------------- MEMORY */
  {
    slug: 'memory',
    title: 'ゲーミングPCのメモリは16GBで足りる？32GBへの増設判断',
    description: 'メモリ増設が効くケースと効かないケースを解説。8GB・16GB・32GBの目安、増設時の注意点（規格・枚数・相性）をまとめています。',
    h1: 'メモリ（RAM）増設',
    lead: '費用が比較的安く、効果が分かりやすい改善です。'
        + 'ただし「足りている容量をさらに増やしても速くはならない」点には注意してください。',
    forWho: [
      '今8GBしかない',
      'ゲーム中に他のアプリを開くと重くなる',
      'ゲーム中に一瞬フリーズする（カクつく）',
      '動画編集や配信を同時に行う',
      'ブラウザのタブを多く開いたまま作業する',
    ],
    notFor: [
      'すでに32GB以上を積んでいる',
      '16GBで、ゲーム以外はあまり動かさない',
      'タスクマネージャーでメモリ使用率に余裕がある',
    ],
    sections: [
      {
        heading: '容量ごとの目安',
        list: [
          '<strong>8GB</strong>：現在のゲームには不足しがち。増設の優先度は高めです',
          '<strong>16GB</strong>：ゲーム用途では標準的。多くの場合これで足ります',
          '<strong>32GB</strong>：重量級ゲーム、配信、動画編集を行うなら安心できる容量',
          '<strong>64GB以上</strong>：本格的な制作用途向け。一般的なゲーム用途では過剰です',
        ],
      },
      {
        heading: '「増やせば速くなる」わけではない',
        body: [
          'メモリは<strong>足りないと極端に遅くなる</strong>一方、'
          + '<strong>足りていれば増やしても速くなりません</strong>。'
          + '16GBで使用率に余裕がある人が32GBにしても、体感の変化はほとんどありません。',
          'まずタスクマネージャーの［パフォーマンス］→［メモリ］で、'
          + 'ゲーム中の使用量を確認してください。'
          + '上限に張り付いているようなら増設の効果が期待できます。',
        ],
      },
      {
        heading: '増設時の注意点',
        body: [
          '<strong>規格を合わせる</strong>：DDR4とDDR5には互換性がありません。'
          + 'マザーボードが対応している方を選ぶ必要があります。',

          '<strong>2枚1組が基本</strong>：メモリは2枚挿し（デュアルチャネル）にすると性能が上がります。'
          + '8GB×1枚から増やす場合、8GBを1枚足すより'
          + '<strong>16GB（8GB×2）のセットに交換する方が安定します</strong>。'
          + '既存メモリと型番が違うと、相性問題で起動しないことがあるためです。',

          '<strong>空きスロットの確認</strong>：スロットが埋まっている場合は、'
          + '増設ではなく交換になります。',
        ],
      },
    ],
    faq: [
      {
        q: 'メモリを増やすとFPSは上がりますか？',
        a: 'メモリが不足している場合は改善します（カクつきが減る）。'
         + 'すでに足りている場合、容量を増やしてもFPSはほぼ変わりません。',
      },
      {
        q: '違うメーカーのメモリを混ぜても大丈夫ですか？',
        a: '動く場合もありますが、規格・速度・容量が異なると不安定になったり起動しないことがあります。'
         + '確実性を優先するなら、2枚1組で販売されているセット品への交換をおすすめします。',
      },
      {
        q: '16GBから32GBにする価値はありますか？',
        a: '用途によります。重量級ゲーム、配信、動画編集を行うなら価値があります。'
         + 'ゲームのみで現在困っていないなら、優先度は低めです。',
      },
    ],
    products: ['ddr4_32gb', 'ddr5_32gb'],
    productHeading: '32GBへの増設でよく選ばれるメモリ',
    related: ['ssd', 'gpu', 'vs-new-pc'],
  },

  /* --------------------------------------------------------- STORAGE */
  {
    slug: 'ssd',
    title: 'SSD増設・換装ガイド｜ゲームの容量不足と読み込みの遅さを解決',
    description: 'ゲームの容量が足りない、読み込みが遅いときのSSD増設・換装を解説。HDDからの換装効果、NVMeとSATAの違い、増設時の確認点をまとめています。',
    h1: 'SSD増設・換装',
    lead: '容量不足の解消と、読み込み速度の改善に効きます。'
        + 'とくにHDDを使っている場合は、体感がはっきり変わる改善です。',
    forWho: [
      'ゲームを入れる容量が足りない',
      'ゲームを消しながら遊んでいる',
      'Windowsの起動やゲームの読み込みが遅い',
      'まだHDDにゲームを入れている',
    ],
    notFor: [
      'すでにNVMe SSDを使っていて、容量にも余裕がある',
      '不満がFPS（ゲームのなめらかさ）である（この場合はGPU側）',
    ],
    sections: [
      {
        heading: 'HDDからSSDへの換装は効果が大きい',
        body: [
          'HDDにWindowsやゲームが入っている場合、'
          + '<strong>SSDへの換装は最も体感しやすい改善のひとつ</strong>です。'
          + 'Windowsの起動、ゲームの読み込み、マップの切り替えなどが大きく短縮されます。',
          'ただし<strong>ゲーム中のFPSはほとんど変わりません</strong>。'
          + 'FPSが不満な場合はGPU側の検討が必要です。',
        ],
      },
      {
        heading: 'NVMeとSATA、どちらを選ぶか',
        list: [
          '<strong>NVMe SSD（M.2）</strong>：現在の主流。マザーボードに直接挿すため配線不要です',
          '<strong>SATA SSD（2.5インチ）</strong>：NVMeより低速ですが、'
          + 'M.2スロットが空いていない場合の選択肢になります',
          '実際のゲーム体験では、NVMeとSATAの差はHDD→SSDほど大きくは感じません',
        ],
      },
      {
        heading: '増設時の確認点',
        body: [
          '<strong>M.2スロットの空き</strong>：マザーボードのM.2スロット数は製品によって異なります。'
          + '空きがあれば、既存のSSDを外さずに追加できます。',
          '<strong>既存SSDを残せる</strong>：増設の場合、Windowsを入れ直す必要はありません。'
          + '新しいSSDをゲーム用のドライブとして使えます。',
          '<strong>容量の目安</strong>：最近のゲームは1本で100GBを超えるものもあります。'
          + '複数のタイトルを入れておきたいなら1TB以上が現実的です。',
        ],
      },
    ],
    faq: [
      {
        q: 'SSDを増設するとゲームは速くなりますか？',
        a: '読み込み時間は短くなりますが、ゲーム中のFPSは基本的に変わりません。'
         + '「マップの読み込みが長い」「起動が遅い」という不満には効果があります。',
      },
      {
        q: '増設するとWindowsを入れ直す必要がありますか？',
        a: '増設（既存のSSDを残して追加）の場合は不要です。'
         + '新しいSSDをゲームの保存先として指定するだけで使えます。'
         + 'Windowsごと引っ越す「換装」の場合はクローン作業か再インストールが必要です。',
      },
      {
        q: '何TBあれば足りますか？',
        a: 'ゲームを常時5〜10本入れておきたいなら1TB、'
         + '大作を多く入れる・動画も保存するなら2TB以上が目安です。',
      },
    ],
    products: ['ssd_nvme_1tb', 'ssd_nvme_2tb'],
    productHeading: '増設でよく選ばれるSSD',
    related: ['memory', 'gpu', 'vs-new-pc'],
  },

  /* ------------------------------------------------------------- PSU */
  {
    slug: 'psu',
    title: '電源交換の目安｜GPU交換時に必要な電源容量の計算と選び方',
    description: 'GPU交換時に見落としやすい電源容量。必要なW数の考え方、80PLUS認証、補助電源コネクタ（12VHPWR）の確認方法を解説します。',
    h1: '電源ユニット交換',
    lead: '電源を替えてもPCは速くなりません。'
        + 'しかし<strong>GPUを交換するときに見落とすと、そもそも動きません</strong>。'
        + '安全に関わる部分なので、必ず確認してください。',
    forWho: [
      '消費電力の大きいGPUに交換したい',
      '高負荷時にPCが突然落ちる・再起動する',
      '電源を5年以上使っている',
      '補助電源コネクタの本数が足りない',
    ],
    notFor: [
      'GPUを交換する予定がなく、今の構成で問題なく動いている',
      '電源容量に十分な余裕がある',
    ],
    sections: [
      {
        heading: '必要な容量の考え方',
        body: [
          '大まかには <strong>GPUの消費電力 + 150W（CPUやその他）</strong> を求め、'
          + 'そこに<strong>1.3〜1.4倍の余裕</strong>を見た値が目安になります。',
          '余裕を持たせる理由は2つあります。ひとつは瞬間的に大きな電力を消費する場面があること。'
          + 'もうひとつは、電源には<strong>定格の50〜60%付近で効率が最も良くなる</strong>特性があるためです。'
          + 'ぎりぎりの容量を選ぶと、効率も寿命も不利になります。',
          'このページ上部の<a href="/upgrade/">アップグレード診断</a>では、'
          + '交換予定のGPUに対する必要容量の目安を自動で計算します。',
        ],
      },
      {
        heading: '補助電源コネクタを確認する',
        body: [
          '容量（W数）が足りていても、<strong>コネクタの形状と本数が合わなければ接続できません</strong>。',
        ],
        list: [
          '<strong>8pin（PCIe）</strong>：従来から使われている形状。必要本数はGPUによります',
          '<strong>12VHPWR / 12V-2x6</strong>：新しい世代のGPUで使われる形状。'
          + '変換ケーブルが付属する場合もありますが、対応電源の方が安全です',
          '購入前に、交換するGPUが要求するコネクタと、'
          + '今の電源が持っているコネクタを必ず見比べてください',
        ],
      },
      {
        heading: '80PLUS認証について',
        body: [
          '80PLUSは電力変換効率の認証です。'
          + 'Bronze / Silver / Gold / Platinum / Titanium の順に効率が高くなります。',
          'ただし<strong>効率が高い＝性能が上がるわけではありません</strong>。'
          + '効率が高いほど発熱と電気代が抑えられる、という違いです。'
          + '一般的な用途ではBronze〜Goldで十分実用的です。',
        ],
      },
      {
        heading: '電源は寿命があるパーツです',
        body: [
          '電源ユニットは内部のコンデンサが劣化するため、'
          + '<strong>5年程度を目安に交換を検討する</strong>パーツです。'
          + '劣化した電源は、高負荷時に電力を供給しきれず、'
          + '突然の電源断や再起動の原因になります。',
          '古い電源を使い続けたまま消費電力の大きいGPUを載せるのは避けてください。'
          + '最悪の場合、他のパーツを巻き込んで故障することがあります。',
        ],
      },
    ],
    faq: [
      {
        q: '電源を交換するとPCは速くなりますか？',
        a: 'なりません。電源は性能を上げるパーツではなく、'
         + '他のパーツを安定して動かすためのものです。'
         + 'ただし容量不足の状態では性能が出ない・動作が不安定になることがあります。',
      },
      {
        q: '容量が足りないとどうなりますか？',
        a: '起動しない、高負荷時に突然電源が落ちる、再起動を繰り返す、といった症状が出ます。'
         + 'GPUを交換して不安定になった場合、電源容量が原因のことがよくあります。',
      },
      {
        q: '容量は大きければ大きいほど良いですか？',
        a: '過剰に大きくても無駄になります。効率が最も良いのは定格の50〜60%付近の負荷です。'
         + '必要容量に対して1.3〜1.4倍程度を目安に選ぶのが合理的です。',
      },
    ],
    products: ['psu_650w', 'psu_750w', 'psu_850w'],
    productHeading: '容量別の電源ユニット',
    related: ['gpu', 'cooler', 'vs-new-pc'],
  },

  /* ---------------------------------------------------------- COOLER */
  {
    slug: 'cooler',
    title: 'CPUクーラー交換の効果｜温度が下がると性能が戻る仕組み',
    description: 'CPU温度が高いと性能が下がります（サーマルスロットリング）。空冷と簡易水冷の違い、交換すべきケースと不要なケースを解説します。',
    h1: 'CPUクーラー交換',
    lead: 'CPUは温度が上がりすぎると、自分を守るために性能を落とします。'
        + 'その状態なら、クーラーの交換で<strong>本来の性能を取り戻せる</strong>ことがあります。',
    forWho: [
      'ファンの音が大きくて気になる',
      'ゲーム中のCPU温度が高い（85℃以上が続く）',
      '長時間プレイすると性能が落ちる',
      'CPUを性能の高いものに交換した',
    ],
    notFor: [
      'CPU温度が常識的な範囲に収まっている（ゲーム中で70〜80℃程度）',
      '動作音が気にならない',
      'FPSが出ない原因がGPU側にある',
    ],
    sections: [
      {
        heading: 'まず温度を確認する',
        body: [
          'クーラーを替える前に、<strong>実際に温度が問題になっているか</strong>を確認してください。'
          + 'ゲーム中のCPU温度が70〜80℃程度なら、多くの場合は正常な範囲です。',
          '90℃以上に達し続けている場合は、'
          + '<strong>サーマルスロットリング</strong>（熱を下げるために性能を落とす動作）'
          + 'が起きている可能性があります。この状態ではクーラー交換の効果が期待できます。',
          'ただし、その前に確認したいことがあります。'
          + '<strong>ケース内のホコリ</strong>と<strong>グリスの劣化</strong>です。'
          + '掃除とグリスの塗り直しだけで温度が下がることは珍しくありません。'
          + '費用をかける前に試す価値があります。',
        ],
      },
      {
        heading: '空冷と簡易水冷',
        list: [
          '<strong>空冷</strong>：構造が単純で寿命が長く、価格も控えめ。'
          + '多くの用途ではこれで十分です',
          '<strong>簡易水冷（240mm / 360mm）</strong>：冷却能力が高く、'
          + '発熱の大きいCPU向け。ただしポンプの寿命があり、価格も上がります',
          '一般的なゲーム用途では、性能の良い空冷クーラーで足りることがほとんどです',
        ],
      },
      {
        heading: '取り付け前の確認',
        body: [
          '<strong>ソケット対応</strong>：CPUのソケット（AM4 / AM5 / LGA1700 など）に'
          + '対応した製品を選ぶ必要があります。',
          '<strong>高さ制限</strong>：空冷クーラーは背が高いため、'
          + 'ケースの「対応CPUクーラー高」を超えるとサイドパネルが閉まりません。',
          '<strong>メモリとの干渉</strong>：大型の空冷クーラーは、'
          + '背の高いメモリと物理的にぶつかることがあります。',
        ],
      },
    ],
    faq: [
      {
        q: 'CPUクーラーを替えるとFPSは上がりますか？',
        a: '温度が原因で性能が落ちていた場合は改善します。'
         + '温度に問題がなければ、FPSは変わりません。まず温度の確認が先です。',
      },
      {
        q: '簡易水冷の方が優れていますか？',
        a: '用途によります。冷却能力は高いですが、ポンプという可動部があるぶん寿命の懸念があり、'
         + '価格も上がります。一般的なゲーム用途なら、質の良い空冷で十分な場合が多いです。',
      },
      {
        q: 'グリスは塗り直した方がいいですか？',
        a: '数年使っているPCであれば、塗り直しで温度が下がることがあります。'
         + 'クーラーを買い替える前に試す価値のある、費用の安い方法です。',
      },
    ],
    products: ['cooler_air', 'cooler_aio_240'],
    productHeading: 'CPUクーラーの選択肢',
    related: ['cpu', 'psu', 'gpu'],
  },

  /* ------------------------------------------------------ VS NEW PC */
  {
    slug: 'vs-new-pc',
    title: 'PCは買い替えとアップグレードどちらが得？判断の基準と費用比較',
    description: 'ゲーミングPCをアップグレードすべきか買い替えるべきかの判断基準を解説。交換パーツ数・費用・PCの年数から、どちらが有利かを整理します。',
    h1: '買い替え vs アップグレード',
    lead: 'アップグレードは万能ではありません。'
        + '交換するパーツが増えるほど費用は膨らみ、'
        + 'ある地点を超えると<strong>新しいPCを買った方が有利</strong>になります。'
        + 'その境目を整理します。',
    forWho: [
      'アップグレードすべきか買い替えるべきか迷っている',
      '見積もりを取ったが金額が妥当か分からない',
      '今のPCをあと数年使えるか知りたい',
    ],
    notFor: [],
    sections: [
      {
        heading: '判断の基準は「交換点数」と「合計費用」',
        body: [
          '目安として、<strong>交換が1〜2点で収まるならアップグレードが有利</strong>です。'
          + '一方、<strong>3点以上、または合計20万円前後になるなら買い替えを検討</strong>してください。',
          'とくに<strong>CPUの交換が必要な場合は注意</strong>が必要です。'
          + 'CPUを替えるとマザーボードの交換が必要になることが多く、'
          + 'マザーボードを替えるとメモリの規格も変わることがあります。'
          + 'この3点が連鎖すると、流用できるのはケース・電源・ストレージ程度になり、'
          + '実質的に新しいPCを組むのと変わりません。',
        ],
      },
      {
        heading: 'アップグレードが有利なケース',
        list: [
          '<strong>GPUだけ替えれば足りる</strong>：最も費用対効果が高いパターンです',
          '<strong>メモリ・SSDの不足</strong>：費用が安く、効果もはっきり出ます',
          '<strong>GPU + 電源の2点</strong>：この範囲なら買い替えより安く済むことが多いです',
          '<strong>CPUがまだ現役</strong>：土台が新しければ、GPUの交換だけで長く使えます',
        ],
      },
      {
        heading: '買い替えが有利なケース',
        list: [
          '<strong>CPU・マザーボード・メモリの交換が必要</strong>：費用が新品PCに近づきます',
          '<strong>交換費用の合計が20万円前後</strong>：新品なら全体に保証が付きます',
          '<strong>PCの使用年数が7年以上</strong>：他のパーツも寿命が近く、'
          + '交換後に別の箇所が故障する可能性があります',
          '<strong>特殊な形状のメーカー製PC</strong>：電源やケースが独自規格で交換しにくい場合があります',
        ],
      },
      {
        heading: '見落としやすい「買い替えの利点」',
        body: [
          '費用だけで比べると見落としがちですが、新品PCには次の利点があります。',
        ],
        list: [
          '<strong>全体に保証が付く</strong>：パーツ単位ではなくPC全体が保証対象になります',
          '<strong>相性問題がない</strong>：動作確認済みの組み合わせで届きます',
          '<strong>作業の手間がない</strong>：取り付け作業や初期不良の切り分けが不要です',
          '<strong>今のPCを売却できる</strong>：中古で売れば実質的な負担を減らせます',
        ],
      },
      {
        heading: 'アップグレードの利点',
        list: [
          '<strong>費用を抑えられる</strong>：必要な部分だけを替えるため無駄がありません',
          '<strong>データの移行が不要</strong>：Windowsやゲームをそのまま使えます',
          '<strong>気に入っているケースを使い続けられる</strong>',
          '<strong>段階的に投資できる</strong>：今回はGPU、次はメモリ、と分けられます',
        ],
      },
    ],
    faq: [
      {
        q: '何年使ったPCなら買い替えるべきですか？',
        a: '年数だけでは決まりません。5年前のPCでもGPU交換だけで十分使えることがあります。'
         + 'ただし7年以上経過している場合は、電源やストレージの寿命も近く、'
         + '交換後に別の箇所が壊れる可能性を考慮した方がよいでしょう。',
      },
      {
        q: '古いPCは売れますか？',
        a: '動作するPCであれば買い取ってもらえる場合があります。'
         + '買い替えを検討する際は、売却額を差し引いた実質負担で比較すると判断しやすくなります。',
      },
      {
        q: '中途半端にアップグレードするのは損ですか？',
        a: '目的がはっきりしていれば損ではありません。'
         + '「フルHD60fpsで安定して遊べればいい」なら、GPU交換だけで目的を達成できます。'
         + '問題になるのは、目的に対して過剰なパーツを選んでしまう場合です。',
      },
    ],
    products: ['gaming_pc_middle', 'gaming_pc_high'],
    productHeading: '買い替えを検討する場合',
    related: ['gpu', 'cpu', 'memory'],
  },
];

/* =====================================================================
 *  SEO記事
 *  ---------------------------------------------------------------------
 *  「型番で検索している人」を受け止めて診断へ送るページ。
 *  内容は articles-data.js に分けている（このファイルが長くなりすぎるため）。
 * ===================================================================== */
var ARTICLES = require('./articles-data.js').ARTICLES;

/* パーツ解説ページと記事を同じテンプレートで生成する。
   構造が同じなので、テンプレートを二重に持たない。 */
var ALL_PAGES = PAGES.concat(ARTICLES);

/* =====================================================================
 *  テンプレート
 * ===================================================================== */

/** 関連ページのカードを組み立てる */
function relatedCards(slugs) {
  var byslug = {};
  ALL_PAGES.forEach(function (p) { byslug[p.slug] = p; });

  return slugs.map(function (s) {
    var p = byslug[s];
    if (!p) return '';
    return '          <a class="u-related__card" href="/upgrade/' + esc(p.slug) + '/">\n'
      + '            <span class="u-related__en">' + esc(p.slug.toUpperCase()) + '</span>\n'
      + '            <strong>' + esc(p.h1) + '</strong>\n'
      + '            <span>' + esc(p.lead.replace(/<[^>]+>/g, '').slice(0, 46)) + '…</span>\n'
      + '          </a>';
  }).filter(Boolean).join('\n');
}

/** FAQPage 構造化データ（実際にページ内にFAQがあるときだけ出す） */
function faqJsonLd(page) {
  if (!page.faq || !page.faq.length) return '';
  var entities = page.faq.map(function (f) {
    return {
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        // 構造化データにはHTMLタグを含めない
        text: f.a.replace(/<[^>]+>/g, ''),
      },
    };
  });
  var data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entities,
  };
  return '  <script type="application/ld+json">\n  '
    + JSON.stringify(data, null, 2).split('\n').join('\n  ')
    + '\n  </script>\n';
}

function buildPage(page) {
  var url = SITE + '/upgrade/' + page.slug + '/';

  /* --- 本文セクション --- */
  var sectionsHtml = page.sections.map(function (s) {
    var html = '        <div class="u-card" style="margin-bottom:16px">\n'
      + '          <h2 style="font-size:clamp(17px,4vw,21px);margin-bottom:12px">' + esc(s.heading) + '</h2>\n';
    (s.body || []).forEach(function (b) {
      html += '          <p style="color:var(--u-fg-soft);font-size:14.5px;margin-bottom:12px">' + b + '</p>\n';
    });
    if (s.list && s.list.length) {
      html += '          <ul class="u-menu-card__for" style="border-top:none;padding-top:0;margin-top:0">\n';
      s.list.forEach(function (li) {
        html += '            <li style="margin-bottom:8px">' + li + '</li>\n';
      });
      html += '          </ul>\n';
    }
    html += '        </div>\n';
    return html;
  }).join('');

  /* --- こんな人向け / 不要な人 --- */
  var forWhoHtml = '';
  if (page.forWho && page.forWho.length) {
    forWhoHtml += '        <div class="u-card" style="border-left:4px solid var(--u-accent);margin-bottom:16px">\n'
      + '          <h2 style="font-size:clamp(17px,4vw,21px);margin-bottom:12px">こんな人におすすめ</h2>\n'
      + '          <ul class="u-menu-card__for" style="border-top:none;padding-top:0;margin-top:0">\n';
    page.forWho.forEach(function (w) {
      forWhoHtml += '            <li style="margin-bottom:8px">' + esc(w) + '</li>\n';
    });
    forWhoHtml += '          </ul>\n        </div>\n';
  }

  // ★「交換しなくていい人」を必ず併記する。
  //   これが無いと、ただの購入誘導ページになってしまう。
  if (page.notFor && page.notFor.length) {
    forWhoHtml += '        <div class="u-card" style="border-left:4px solid var(--u-keep);margin-bottom:16px">\n'
      + '          <h2 style="font-size:clamp(17px,4vw,21px);margin-bottom:12px">交換しなくてよい可能性が高い人</h2>\n'
      + '          <p style="color:var(--u-fg-soft);font-size:14px;margin-bottom:10px">'
      + '次に当てはまる場合、交換しても効果を感じにくいことがあります。</p>\n'
      + '          <ul class="u-menu-card__for" style="border-top:none;padding-top:0;margin-top:0">\n';
    page.notFor.forEach(function (w) {
      forWhoHtml += '            <li style="margin-bottom:8px">' + esc(w) + '</li>\n';
    });
    forWhoHtml += '          </ul>\n        </div>\n';
  }

  /* --- FAQ --- */
  var faqHtml = '';
  if (page.faq && page.faq.length) {
    faqHtml = '    <section class="u-section u-section--alt">\n'
      + '      <div class="container">\n'
      + '        <div class="u-section__head">\n'
      + '          <p class="u-label">FAQ</p>\n'
      + '          <h2>よくある質問</h2>\n'
      + '        </div>\n'
      + '        <div class="u-faq">\n';
    page.faq.forEach(function (f) {
      faqHtml += '          <details class="u-faq__item">\n'
        + '            <summary>' + esc(f.q) + '</summary>\n'
        + '            <div class="u-faq__body">' + f.a + '</div>\n'
        + '          </details>\n';
    });
    faqHtml += '        </div>\n      </div>\n    </section>\n';
  }

  /* --- 商品（購入導線） --- */
  var productsHtml = '';
  if (page.products && page.products.length) {
    productsHtml = '    <section class="u-section">\n'
      + '      <div class="container">\n'
      + '        <div class="u-section__head">\n'
      + '          <p class="u-label">PRODUCTS</p>\n'
      + '          <h2>' + esc(page.productHeading || 'おすすめパーツ') + '</h2>\n'
      + '          <p>価格は変動するため、最新の価格は各ショップでご確認ください。</p>\n'
      + '        </div>\n'
      + '        <div id="productList" data-products="' + esc(page.products.join(',')) + '"></div>\n'
      + '      </div>\n'
      + '    </section>\n';
  }

  /* --- 構造化データ --- */
  var breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'シッポPC', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'PCアップグレード', item: SITE + '/upgrade/' },
      { '@type': 'ListItem', position: 3, name: page.h1, item: url },
    ],
  };

  /* 記事ページだけ Article を付ける。
     パーツ解説ページは「記事」というより機能説明なので付けない
     （実態に合わない schema を足さない）。 */
  var articleJsonLd = '';
  if (page.isArticle) {
    var article = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.h1,
      description: page.description,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: { '@type': 'Organization', name: 'シッポPC' },
      publisher: { '@type': 'Organization', name: 'シッポPC' },
      datePublished: '2026-08-19',
      dateModified: '2026-08-19',
    };
    articleJsonLd = '  <script type="application/ld+json">\n  '
      + JSON.stringify(article, null, 2).split('\n').join('\n  ')
      + '\n  </script>\n';
  }

  return '<!DOCTYPE html>\n'
+ '<html lang="ja">\n'
+ '<head>\n'
+ '  <meta charset="UTF-8">\n'
+ '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
+ '  <title>' + esc(page.title) + ' - シッポPC</title>\n'
+ '  <meta name="description" content="' + esc(page.description) + '">\n'
+ '  <link rel="canonical" href="' + url + '">\n'
+ '\n'
+ '  <meta property="og:type" content="article">\n'
+ '  <meta property="og:site_name" content="シッポPC">\n'
+ '  <meta property="og:title" content="' + esc(page.title) + '">\n'
+ '  <meta property="og:description" content="' + esc(page.description) + '">\n'
+ '  <meta property="og:url" content="' + url + '">\n'
+ '  <meta property="og:image" content="' + SITE + '/assets/ogp.png">\n'
+ '  <meta property="og:image:width" content="1200">\n'
+ '  <meta property="og:image:height" content="630">\n'
+ '  <meta property="og:locale" content="ja_JP">\n'
+ '  <meta name="twitter:card" content="summary_large_image">\n'
+ '  <meta name="twitter:title" content="' + esc(page.title) + '">\n'
+ '  <meta name="twitter:description" content="' + esc(page.description) + '">\n'
+ '  <meta name="twitter:image" content="' + SITE + '/assets/ogp.png">\n'
+ '\n'
+ '  <meta name="theme-color" content="#0B0F14">\n'
+ '  <link rel="icon" href="/favicon.png" type="image/png">\n'
+ '  <link rel="apple-touch-icon" href="/assets/icon-192.png">\n'
+ '\n'
+ '  <link rel="preconnect" href="https://fonts.googleapis.com">\n'
+ '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
+ '  <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;700;800&display=swap" rel="stylesheet">\n'
+ '\n'
+ '  <link rel="stylesheet" href="/shared/affiliate/affiliate.css">\n'
+ '  <link rel="stylesheet" href="/shared/nav/sippo-nav.css">\n'
+ '  <link rel="stylesheet" href="/upgrade/style.css">\n'
+ '\n'
+ '  <script type="application/ld+json">\n  '
+ JSON.stringify(breadcrumb, null, 2).split('\n').join('\n  ')
+ '\n  </script>\n'
+ articleJsonLd
+ faqJsonLd(page)
+ '\n'
+ '  <script async src="https://www.googletagmanager.com/gtag/js?id=G-NDQ8GTKGHC"></script>\n'
+ '  <script>\n'
+ '    window.dataLayer = window.dataLayer || [];\n'
+ '    function gtag(){dataLayer.push(arguments);}\n'
+ '    gtag(\'js\', new Date());\n'
+ '    gtag(\'config\', \'G-NDQ8GTKGHC\');\n'
+ '  </script>\n'
+ '</head>\n'
+ '\n'
+ '<body data-sippo-theme="dark" data-sippo-site="upgrade">\n'
+ '\n'
+ '  <header class="u-header">\n'
+ '    <div class="container u-header__inner">\n'
+ '      <a href="/upgrade/" class="u-logo">\n'
+ '        <span class="u-logo__mark">PC UPGRADE</span>\n'
+ '        <span class="u-logo__sub">シッポPC</span>\n'
+ '      </a>\n'
+ '      <nav class="u-header__nav" aria-label="サイト内ナビゲーション">\n'
+ '        <a class="u-header__link" href="/upgrade/#diagnose">診断する</a>\n'
+ '        <a class="u-header__link" href="/upgrade/#menu">交換メニュー</a>\n'
+ '        <a class="u-header__link" href="/upgrade/vs-new-pc/">買い替えと比較</a>\n'
+ '        <div data-sippo-servicenav></div>\n'
+ '      </nav>\n'
+ '    </div>\n'
+ '  </header>\n'
+ '\n'
+ '  <nav class="u-breadcrumb container" aria-label="パンくずリスト">\n'
+ '    <ol>\n'
+ '      <li><a href="/">シッポPC</a></li>\n'
+ '      <li><a href="/upgrade/">PCアップグレード</a></li>\n'
+ '      <li>' + esc(page.h1) + '</li>\n'
+ '    </ol>\n'
+ '  </nav>\n'
+ '\n'
+ '  <main>\n'
+ '    <section class="u-section u-section--tight">\n'
+ '      <div class="container">\n'
+ '        <p class="u-label">' + esc(page.slug.toUpperCase()) + '</p>\n'
+ '        <h1 style="font-size:clamp(23px,5.4vw,36px);line-height:1.35;margin-bottom:16px">' + esc(page.h1) + '</h1>\n'
+ '        <p style="color:var(--u-fg-soft);font-size:clamp(14.5px,3.4vw,16px);max-width:660px">' + page.lead + '</p>\n'
+ '        <p style="margin-top:22px">\n'
+ '          <a href="/upgrade/#diagnose" class="u-btn u-btn--primary">自分のPCを診断する</a>\n'
+ '        </p>\n'
+ '      </div>\n'
+ '    </section>\n'
+ '\n'
+ '    <section class="u-section u-section--tight">\n'
+ '      <div class="container">\n'
+ forWhoHtml
+ sectionsHtml
+ '      </div>\n'
+ '    </section>\n'
+ '\n'
+ productsHtml
+ faqHtml
+ '\n'
+ '    <section class="u-section">\n'
+ '      <div class="container">\n'
+ '        <div class="u-cta">\n'
+ '          <h2>迷ったら診断してみてください</h2>\n'
+ '          <p>今の構成を入力すると、このパーツを交換すべきかどうかを判定します。'
+ '交換が必要ない場合は、その旨をお伝えします。</p>\n'
+ '          <div class="u-cta__actions">\n'
+ '            <a class="u-btn u-btn--primary" href="/upgrade/#diagnose">アップグレード診断へ</a>\n'
+ '            <a class="u-btn u-btn--ghost" href="/pc-consult/">シッポPCに相談する</a>\n'
+ '          </div>\n'
+ '        </div>\n'
+ '      </div>\n'
+ '    </section>\n'
+ '\n'
+ '    <section class="u-section u-section--alt">\n'
+ '      <div class="container">\n'
+ '        <div class="u-section__head">\n'
+ '          <p class="u-label">RELATED</p>\n'
+ '          <h2>関連するページ</h2>\n'
+ '        </div>\n'
+ '        <div class="u-related">\n'
+ relatedCards(page.related || []) + '\n'
+ '        </div>\n'
+ '      </div>\n'
+ '    </section>\n'
+ '  </main>\n'
+ '\n'
+ '  <footer class="u-footer">\n'
+ '    <div class="container">\n'
+ '      <div class="u-footer__grid">\n'
+ '        <div class="u-footer__col">\n'
+ '          <h3>UPGRADE</h3>\n'
+ '          <ul>\n'
+ '            <li><a href="/upgrade/">アップグレード診断</a></li>\n'
+ '            <li><a href="/upgrade/gpu/">GPU交換</a></li>\n'
+ '            <li><a href="/upgrade/cpu/">CPU交換</a></li>\n'
+ '            <li><a href="/upgrade/memory/">メモリ増設</a></li>\n'
+ '            <li><a href="/upgrade/ssd/">SSD増設</a></li>\n'
+ '            <li><a href="/upgrade/psu/">電源交換</a></li>\n'
+ '            <li><a href="/upgrade/cooler/">CPUクーラー交換</a></li>\n'
+ '            <li><a href="/upgrade/vs-new-pc/">買い替えとの比較</a></li>\n'
+ '          </ul>\n'
+ '        </div>\n'
+ '        <div class="u-footer__col">\n'
+ '          <h3>SIPPO PC</h3>\n'
+ '          <ul>\n'
+ '            <li><a href="/">シッポPC トップ</a></li>\n'
+ '            <li><a href="/pc-build-check/">PC BUILD CHECK</a></li>\n'
+ '            <li><a href="/game-pc-guide/">GAME PC GUIDE</a></li>\n'
+ '            <li><a href="/gpu-guide/">GPU GUIDE</a></li>\n'
+ '            <li><a href="/pc-builds-hub/">PC構成投稿サイト</a></li>\n'
+ '            <li><a href="/pc-consult/">シッポPC相談室</a></li>\n'
+ '          </ul>\n'
+ '        </div>\n'
+ '      </div>\n'
+ '      <div class="u-footer__bottom">\n'
+ '        <p>当サイトはアフィリエイト広告（Amazonアソシエイト・楽天アフィリエイト等）を利用しています。'
+ 'リンク先で商品を購入すると運営者に収益が発生する場合があります。'
+ 'Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。</p>\n'
+ '        <p style="margin-top:8px">本ページの内容は一般的な目安です。'
+ '実際の性能・価格・取り付け可否を保証するものではありません。</p>\n'
+ '        <p style="margin-top:8px">© 2026 シッポPC 🐾</p>\n'
+ '      </div>\n'
+ '    </div>\n'
+ '  </footer>\n'
+ '\n'
+ '  <script src="/shared/affiliate/affiliate-config.js"></script>\n'
+ '  <script src="/shared/affiliate/affiliate.js"></script>\n'
+ '  <script src="/shared/nav/sippo-nav.js" defer></script>\n'
+ '  <script src="/upgrade/upgrade-products.js" defer></script>\n'
+ '</body>\n'
+ '</html>\n';
}

/* =====================================================================
 *  書き出し
 * ===================================================================== */
var written = [];

ALL_PAGES.forEach(function (page) {
  var dir = path.join(OUT_ROOT, page.slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  var file = path.join(dir, 'index.html');
  fs.writeFileSync(file, buildPage(page), 'utf8');
  written.push('/upgrade/' + page.slug + '/');
});

console.log('生成したページ (' + written.length + '件):');
console.log('  [パーツ解説]');
PAGES.forEach(function (p) { console.log('    /upgrade/' + p.slug + '/'); });
console.log('  [SEO記事]');
ARTICLES.forEach(function (p) { console.log('    /upgrade/' + p.slug + '/'); });

/* sitemap用のURL一覧も出しておく（手作業のミスを防ぐため） */
console.log('');
console.log('sitemap 用 URL:');
console.log('  ' + SITE + '/upgrade/');
written.forEach(function (w) { console.log('  ' + SITE + w); });

module.exports = { PAGES: PAGES, ARTICLES: ARTICLES, ALL_PAGES: ALL_PAGES };
