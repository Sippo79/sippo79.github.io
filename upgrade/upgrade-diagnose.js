/* =====================================================================
 *  アップグレード診断 UI (upgrade-diagnose.js)
 *  ---------------------------------------------------------------------
 *  フォームの入力を集めて upgrade-engine.js に渡し、結果を描画する。
 *  判定ロジックはここに書かない（エンジン側に集約する）。
 *
 *  【購入導線について】
 *   おすすめパーツの購入ボタンは、必ず既存の共通基盤
 *   shared/affiliate/affiliate.js を使う。独自にURLを組み立てない。
 *   （アフィリエイトIDの管理・リンク切れ対応・計測がすべてあちらに
 *     集約されているため。ここで別実装を作ると二重管理になる）
 *
 *  【URLを変えない理由】
 *   診断結果でURLを書き換えると ?gpu=... のようなクエリURLが生まれる。
 *   このサイト群では過去に、クエリURLをsitemapに載せた結果
 *   「重複・未登録」でインデックスされない問題が起きている。
 *   そのため結果はページ内で描画するだけに留め、URLは触らない。
 * ===================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  var form = doc.getElementById('diagnoseForm');
  var resultBox = doc.getElementById('diagnoseResult');
  if (!form || !resultBox) return;

  var Engine = global.SippoUpgradeEngine;
  if (!Engine) return;

  /** HTML特殊文字をエスケープする（ユーザー入力を表示に混ぜるため必須） */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 金額を「約○万円」の形にする（細かい端数は意味が無いので丸める） */
  function formatYen(value) {
    if (value === null || value === undefined) return null;
    if (value === 0) return '0円';
    if (value >= 10000) {
      var man = value / 10000;
      // 10万円以上は小数を出さない（精度を装わない）
      var text = man >= 10 ? String(Math.round(man)) : String(Math.round(man * 10) / 10);
      return '約' + text + '万円';
    }
    return '約' + Math.round(value / 1000) * 1000 + '円';
  }

  /* 判定ステータスの表示名 */
  var STATUS_LABEL = {
    upgrade:  '交換おすすめ',
    consider: '検討の余地あり',
    optional: '任意',
    keep:     '現状維持でOK',
    check:    '要確認',
    unknown:  '判定不能',
  };

  var VERDICT_TAG = {
    upgrade:      'アップグレード推奨',
    keep:         '交換不要',
    optional:     '任意',
    borderline:   '要比較',
    replace:      '買い替え推奨',
    insufficient: '情報不足',
  };

  /** フォームの入力値を集める */
  function collectInput() {
    function val(name) {
      var el = form.elements[name];
      if (!el) return '';
      return String(el.value || '').trim();
    }
    return {
      gpu: val('gpu'),
      cpu: val('cpu'),
      memory: val('memory'),
      memoryType: val('memoryType') || 'unknown',
      storage: val('storage'),
      storageType: val('storageType') || 'unknown',
      psu: val('psu'),
      resolution: val('resolution') || 'fhd',
      targetFps: val('targetFps') || 60,
      usage: val('usage') || 'normal',
      budget: val('budget'),
    };
  }

  /** 総合判定ブロック */
  function renderVerdict(overall) {
    var cost = formatYen(overall.estimatedCost);
    var html = '<div class="u-verdict u-verdict--' + esc(overall.verdict) + '">'
      + '<span class="u-verdict__tag">' + esc(VERDICT_TAG[overall.verdict] || '判定') + '</span>'
      + '<h3>' + esc(overall.headline) + '</h3>'
      + '<p>' + esc(overall.detail) + '</p>';

    // 費用は「交換するものがある時」だけ出す。
    // 0円や不明のときに金額欄を出すと、かえって誤解を生む。
    if (cost && overall.estimatedCost > 0) {
      html += '<div class="u-verdict__cost">'
        + '<span>交換費用の目安（合計）</span>'
        + '<strong>' + esc(cost) + '</strong>'
        + '</div>';
    }
    html += '</div>';
    return html;
  }

  /** パーツ1件のカード */
  function renderPart(p) {
    var html = '<div class="u-part u-part--' + esc(p.status) + '">'
      + '<div class="u-part__top">'
      + '<span class="u-part__name">' + esc(p.label) + '</span>'
      + '<span class="u-part__status">' + esc(STATUS_LABEL[p.status] || p.status) + '</span>'
      + '</div>'
      + '<p class="u-part__headline">' + esc(p.headline) + '</p>'
      + '<p class="u-part__detail">' + esc(p.detail) + '</p>';

    // 予算内に候補が無く「現状維持」とした場合の参考候補。
    // ★通常のおすすめとは明確に分けて出す。
    //   予算を超えるGPUを普通のおすすめとして並べると、
    //   予算を指定した意味が無くなってしまうため。
    //   購入ボタンもここでは出さない（勧めていないので）。
    if (p.status === 'keep' && p.referenceId && p.referencePrice) {
      var A2 = global.SippoAffiliate;
      var refProduct = A2 && A2.isReady() ? A2.getProduct(p.referenceId) : null;
      var refName = refProduct ? refProduct.shortName : p.referenceId;
      html += '<div class="u-part__over">'
        + '<span class="u-part__over-tag">予算オーバー（参考）</span>'
        + '<p class="u-part__over-text">'
        + 'どうしても性能を上げたい場合、もっとも安い候補は '
        + '<strong>' + esc(refName) + '</strong>（約'
        + esc(formatYen(p.referencePrice)) + '）です。'
        + 'ご指定の予算を超えるため、おすすめとしては提示していません。'
        + '</p>'
        + '</div>';
    }

    // 交換提案がある場合は before → after を見せる
    if (p.recommendId && (p.status === 'upgrade' || p.status === 'consider')) {
      var A = global.SippoAffiliate;
      var currentName = p.currentId && A && A.isReady() && A.getProduct(p.currentId)
        ? A.getProduct(p.currentId).shortName
        : null;
      var recProduct = A && A.isReady() ? A.getProduct(p.recommendId) : null;
      var recName = recProduct ? recProduct.shortName : p.recommendId;

      if (currentName) {
        html += '<div class="u-swap">'
          + '<div class="u-swap__box">'
          + '<span class="u-swap__label">今</span>'
          + '<span class="u-swap__value">' + esc(currentName) + '</span>'
          + '</div>'
          + '<span class="u-swap__arrow" aria-hidden="true">→</span>'
          + '<div class="u-swap__box u-swap__box--to">'
          + '<span class="u-swap__label">おすすめ</span>'
          + '<span class="u-swap__value">' + esc(recName) + '</span>'
          + '</div>'
          + '</div>';
      }

      var price = p.priceHint || (Engine.PRICE_HINT && Engine.PRICE_HINT[p.recommendId]);
      if (price) {
        html += '<p class="u-part__price">費用の目安 <strong>'
          + esc(formatYen(price)) + '</strong>（相場は変動します）</p>';
      }

      // 購入ボタンは共通基盤に任せる。
      // 商品が特定できない場合は空文字が返るので、そのまま入れて安全。
      if (A && A.isReady()) {
        html += A.renderAffiliateButtons(p.recommendId, {
          page: 'upgrade',
          placement: 'diagnose-result',
          disclosure: false,
        });
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * 判定情報の充実度を表示する。
   *
   * ★「精度◯%」のような数値は出さない。
   *   入力の量から統計的な正確さを出しているわけではないため、
   *   数字にすると根拠のない安心・不安を与えてしまう。
   *   代わりに4段階のレベルと「あと何が分かると良いか」を示す。
   */
  function renderConfidence(c) {
    if (!c) return '';

    // ●で段階を示す（★だと「評価が高い/低い」に見えるため、
    // 情報量の目盛りとして中立な記号を使う）
    var dots = '';
    for (var i = 1; i <= c.maxLevel; i++) {
      dots += '<span class="u-conf__dot' + (i <= c.level ? ' is-on' : '') + '"'
        + ' aria-hidden="true"></span>';
    }

    var html = '<div class="u-conf u-conf--lv' + c.level + '">'
      + '<div class="u-conf__head">'
      + '<span class="u-conf__label">診断情報</span>'
      + '<span class="u-conf__dots" role="img" aria-label="4段階中' + c.level + '段階">'
      + dots + '</span>'
      + '<span class="u-conf__level">' + esc(c.label) + '</span>'
      + '</div>'
      + '<p class="u-conf__headline">' + esc(c.headline) + '</p>'
      + '<p class="u-conf__detail">' + esc(c.detail) + '</p>';

    // 「あと何を調べればいいか」を、理由つきで示す。
    // ここがユーザーの次の行動につながる部分なので、単なる不足リストにしない。
    if (c.missing && c.missing.length) {
      html += '<div class="u-conf__more">'
        + '<p class="u-conf__more-title">より詳しく診断するには</p>'
        + '<ul class="u-conf__list">';
      c.missing.forEach(function (m) {
        html += '<li>'
          + '<span class="u-conf__item-name">' + esc(m.label) + '</span>'
          + '<span class="u-conf__item-benefit">' + esc(m.benefit) + '</span>'
          + '</li>';
      });
      html += '</ul>'
        + '<p class="u-conf__note">'
        + '分からない場合は、<a href="#how-to-check">PC構成の調べ方</a>を参照してください。'
        + '未入力のままでも、分かる範囲で診断できます。</p>'
        + '</div>';
    }

    html += '</div>';
    return html;
  }

  /** 未確認項目のまとめ */
  function renderUnknowns(unknowns) {
    if (!unknowns || !unknowns.length) return '';
    var items = unknowns.map(function (u) {
      return '<li>' + esc(u) + '</li>';
    }).join('');

    return '<div class="u-unknowns">'
      + '<h4>まだ判定できていない項目</h4>'
      + '<p>以下は情報が足りず判定していません。'
      + '「問題なし」という意味ではありません。'
      + '分かる範囲で入力して再診断すると精度が上がります。</p>'
      + '<ul>' + items + '</ul>'
      + '</div>';
  }

  /** 結果全体を描画する */
  function render(result) {
    var html = '<h2 class="visually-hidden">診断結果</h2>';
    html += renderVerdict(result.overall);
    // 総合判定のすぐ下に置く。
    // 「この結果がどれくらいの情報にもとづくか」は、
    // 結論を読んだ直後に知りたい情報のため。
    html += renderConfidence(result.confidence);

    html += '<div class="u-parts">';
    result.parts.forEach(function (p) {
      html += renderPart(p);
    });
    html += '</div>';

    html += renderUnknowns(result.unknowns);

    // 判定に応じて次の行き先を変える。
    // 「買い替え推奨」の人に相談だけ勧めても役に立たないので、
    // PC選びのサイトへ送る。
    var v = result.overall.verdict;
    if (v === 'replace' || v === 'borderline') {
      html += '<div class="u-cta" style="margin-top:26px">'
        + '<h2>新しいPCも比較してみませんか</h2>'
        + '<p>買い替えを検討する場合は、予算と用途からおすすめ構成を診断できます。'
        + '判断に迷う場合は、有料の相談窓口でも承っています。</p>'
        + '<div class="u-cta__actions">'
        + '<a class="u-btn u-btn--primary" href="/pc-build-check/">PC構成を診断する</a>'
        + '<a class="u-btn u-btn--ghost" href="/pc-consult/">シッポPCに相談する</a>'
        + '</div></div>';
    } else if (v !== 'keep') {
      html += '<div class="u-cta" style="margin-top:26px">'
        + '<h2>この結果で進めて大丈夫か、確認できます</h2>'
        + '<p>「本当にこのパーツで合うのか」「取り付けられるか不安」という場合は、'
        + '相談窓口で構成を確認できます。作業そのものが不安な場合もご相談ください。</p>'
        + '<div class="u-cta__actions">'
        + '<a class="u-btn u-btn--primary" href="/pc-consult/">シッポPCに相談する</a>'
        + '<a class="u-btn u-btn--ghost" href="/upgrade/vs-new-pc/">買い替えと比較する</a>'
        + '</div></div>';
    }

    html += '<p class="u-disclaimer">'
      + '※ この診断は、入力内容といっぱんに公開されている性能の目安をもとにした'
      + '簡易的な判定です。実際の性能はゲームタイトル・設定・冷却状況・'
      + '個体差によって変わります。<br>'
      + '※ 費用は変動する相場のおおよその目安であり、実売価格を保証するものではありません。<br>'
      + '※ パーツの取り付け可否（ケースの空間・マザーボードの対応・BIOS更新の要否・'
      + '補助電源コネクタの形状）は、実機の確認が必要です。'
      + '判断に迷う場合は交換前にご相談ください。'
      + '</p>';

    resultBox.innerHTML = html;
    resultBox.hidden = false;

    // 購入ボタンのクリック計測を有効化する（共通基盤側の処理）。
    // イベント委譲なので、あとから描画したボタンにも効く。
    // 多重呼び出しは共通基盤側で無視されるため、毎回呼んで問題ない。
    if (global.SippoAffiliate && global.SippoAffiliate.isReady()) {
      global.SippoAffiliate.bindTracking();
    }

    // 結果の先頭までスクロールする。
    // 結果が画面外に描画されて「何も起きていない」ように見えるのを防ぐ。
    var top = resultBox.getBoundingClientRect().top + global.pageYOffset - 70;
    global.scrollTo({ top: top, behavior: 'smooth' });

    // GA4：診断が実行されたことを記録する（計測は必ずおまけ扱い）
    try {
      if (typeof global.gtag === 'function') {
        global.gtag('event', 'upgrade_diagnose', {
          verdict: result.overall.verdict,
          parts_to_change: result.overall.partsToChange,
          resolution: result.input.resolution,
        });
      }
    } catch (e) { /* 計測の失敗で診断を止めない */ }
  }

  /** 診断を実行する */
  function run() {
    var input = collectInput();
    var result;
    try {
      result = Engine.diagnose(input);
    } catch (e) {
      // ロジック側の想定外でも、ユーザーを無言で放置しない
      resultBox.innerHTML = '<div class="u-verdict u-verdict--insufficient">'
        + '<h3>診断中に問題が発生しました</h3>'
        + '<p>お手数ですが、入力内容を確認してもう一度お試しください。</p></div>';
      resultBox.hidden = false;
      return;
    }
    render(result);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // 購入ボタンを出すために商品マスターを読み込んでから描画する。
    // 読み込みに失敗しても診断結果自体は表示する（購入ボタンが出ないだけ）。
    if (global.SippoAffiliate && !global.SippoAffiliate.isReady()) {
      global.SippoAffiliate.init().then(run, run);
    } else {
      run();
    }
  });

  // リセット時は結果も消す（古い結果が残ると混乱するため）
  form.addEventListener('reset', function () {
    resultBox.hidden = true;
    resultBox.innerHTML = '';
  });
})(typeof window !== 'undefined' ? window : this);
