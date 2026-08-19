/* =====================================================================
 *  GPU / CPU 入力のオートコンプリート (upgrade-autocomplete.js)
 *  ---------------------------------------------------------------------
 *  「RTX 3060」のような型番を、初心者でも打ち間違えずに入力できるようにする。
 *
 *  【データの出どころ】
 *   候補は shared/affiliate/affiliate-master.json から作る。
 *   新しくGPU/CPU一覧を持たない（＝二重管理を作らない）。
 *   商品マスターは購入ボタン・診断エンジンのtierと同じキーで作られており、
 *   ここを唯一の情報源にすることで表記が全サイトでそろう。
 *
 *  【設計方針】
 *   - 候補から選ぶのは「任意」。一覧に無い型番も自由に入力できる。
 *     新製品・古いパーツを弾いてしまうと診断自体ができなくなるため。
 *   - 選択したときだけ正式名称（shortName）へ置き換える。
 *     これで診断側に渡る表記のゆれが減る。
 *   - 外部ライブラリを使わない（既存のVanilla JS構成を維持）。
 *   - ARIA combobox パターンで実装し、キーボードだけでも操作できるようにする。
 *
 *  【使い方】
 *   <input class="u-input" name="gpu" data-autocomplete="gpu">
 *   <input class="u-input" name="cpu" data-autocomplete="cpu">
 *   → 対象の input に data-autocomplete="<category>" を付けるだけ。
 * ===================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  var MAX_ITEMS = 8;      // 一度に見せる候補の数（多すぎると選びにくい）
  var idSeq = 0;          // aria-activedescendant 用の連番

  /* ------------------------------------------------------------------
   *  正規化
   *  ------------------------------------------------------------------
   *  affiliate.js / upgrade-engine.js と同じ規則にそろえる。
   *  ここがズレると「候補に出たのに診断で認識されない」ことが起きる。
   * ------------------------------------------------------------------ */
  function normalize(value) {
    return String(value == null ? '' : value)
      // 全角英数字を半角へ
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .toLowerCase()
      .replace(/\b(nvidia|geforce|amd|radeon|intel)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ------------------------------------------------------------------
   *  候補データの構築
   * ------------------------------------------------------------------ */

  /**
   * 商品マスターから、指定カテゴリの候補一覧を作る。
   * @returns {Array} [{ id, label, brand, key, aliasKeys[] }]
   */
  function buildItems(category) {
    var A = global.SippoAffiliate;
    if (!A || !A.isReady()) return [];

    var products = A.getAllProducts();
    var items = [];

    Object.keys(products).forEach(function (id) {
      var p = products[id];
      if (!p || p.category !== category) return;

      var label = p.shortName || p.name || id;
      // 別名も検索対象にする（"Intel Core i5-13400F" などで引けるように）
      var aliasKeys = (p.aliases || []).map(normalize).filter(Boolean);

      items.push({
        id: id,
        label: label,
        brand: p.brand || '',
        key: normalize(label),
        fullKey: normalize(p.name || label),
        aliasKeys: aliasKeys,
      });
    });

    // 表示順は名前順。ブランドでまとめると探しやすい。
    items.sort(function (a, b) {
      if (a.brand !== b.brand) return a.brand < b.brand ? -1 : 1;
      return a.label < b.label ? -1 : 1;
    });

    return items;
  }

  /* ------------------------------------------------------------------
   *  絞り込み
   * ------------------------------------------------------------------ */

  /**
   * 入力文字列に一致する候補を返す。
   *
   * 正規化してから部分一致で調べるので、
   *   "RTX 3060" / "rtx3060" / "3060" / "ＲＴＸ３０６０"
   * はすべて同じ結果になる。
   *
   * 並び順は「前方一致 → 部分一致」。
   * "3060" と打ったとき RTX 3060 が RTX 3060 Ti より先に来てほしいため、
   * 同じ一致種別なら短いラベルを優先する。
   */
  function filterItems(items, query) {
    var q = normalize(query);
    if (!q) return [];

    var starts = [];
    var contains = [];

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var pos = it.key.indexOf(q);

      // 別名でも引けるようにする
      if (pos === -1) {
        for (var a = 0; a < it.aliasKeys.length; a++) {
          var ap = it.aliasKeys[a].indexOf(q);
          if (ap !== -1) { pos = ap; break; }
        }
      }
      if (pos === -1 && it.fullKey.indexOf(q) !== -1) pos = it.fullKey.indexOf(q);
      if (pos === -1) continue;

      (pos === 0 ? starts : contains).push(it);
    }

    function byLength(a, b) { return a.key.length - b.key.length; }
    starts.sort(byLength);
    contains.sort(byLength);

    return starts.concat(contains).slice(0, MAX_ITEMS);
  }

  /* ------------------------------------------------------------------
   *  1つの入力欄に対する制御
   * ------------------------------------------------------------------ */
  function setup(input) {
    var category = input.getAttribute('data-autocomplete');
    if (!category) return;

    var items = [];
    var matches = [];
    var activeIndex = -1;
    var listId = 'sippo-ac-' + (++idSeq);

    /* --- 要素を組み立てる --- */
    // input を包む箱。候補リストの位置決めに使う。
    var wrap = doc.createElement('div');
    wrap.className = 'u-ac';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var list = doc.createElement('ul');
    list.className = 'u-ac__list';
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    wrap.appendChild(list);

    // 読み上げ用の状況説明（視覚的には隠す）
    var status = doc.createElement('span');
    status.className = 'visually-hidden';
    status.setAttribute('aria-live', 'polite');
    wrap.appendChild(status);

    /* --- ARIA（combobox パターン） --- */
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-autocomplete', 'list');
    // ブラウザ標準の入力補完と二重に出ないようにする
    input.setAttribute('autocomplete', 'off');

    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    }

    function render() {
      if (!matches.length) { close(); return; }

      var html = '';
      for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        html += '<li class="u-ac__item" role="option" id="' + listId + '-' + i + '"'
          + ' aria-selected="' + (i === activeIndex ? 'true' : 'false') + '"'
          + ' data-index="' + i + '">'
          + '<span class="u-ac__name">' + esc(m.label) + '</span>'
          + (m.brand ? '<span class="u-ac__brand">' + esc(m.brand) + '</span>' : '')
          + '</li>';
      }
      list.innerHTML = html;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');

      status.textContent = matches.length + '件の候補があります';
    }

    function setActive(index) {
      if (!matches.length) return;
      // 端まで来たら反対側へ回す（キーボード操作の行き止まりを作らない）
      if (index < 0) index = matches.length - 1;
      if (index >= matches.length) index = 0;
      activeIndex = index;

      var nodes = list.querySelectorAll('.u-ac__item');
      for (var i = 0; i < nodes.length; i++) {
        var on = i === activeIndex;
        nodes[i].setAttribute('aria-selected', on ? 'true' : 'false');
        nodes[i].classList.toggle('is-active', on);
        if (on) {
          input.setAttribute('aria-activedescendant', nodes[i].id);
          // 選択中の項目がリストの外に出ないようスクロールする
          if (nodes[i].scrollIntoView) {
            nodes[i].scrollIntoView({ block: 'nearest' });
          }
        }
      }
    }

    /** 候補を確定する。ここで初めて正式名称へ置き換える。 */
    function choose(index) {
      var m = matches[index];
      if (!m) return;
      input.value = m.label;
      close();
      // 診断フォームの他の処理が値の変更を検知できるようにする
      try {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) { /* 古いブラウザでは何もしない */ }
    }

    /* --- 入力 --- */
    input.addEventListener('input', function () {
      // 初回入力時に候補データを作る（マスター取得後）
      if (!items.length) items = buildItems(category);
      matches = filterItems(items, input.value);
      activeIndex = -1;
      render();
    });

    input.addEventListener('focus', function () {
      if (!input.value) return;
      if (!items.length) items = buildItems(category);
      matches = filterItems(items, input.value);
      render();
    });

    /* --- キーボード --- */
    input.addEventListener('keydown', function (e) {
      var open = !list.hidden;

      if (e.key === 'ArrowDown') {
        if (!open) {
          if (!items.length) items = buildItems(category);
          matches = filterItems(items, input.value);
          render();
          if (matches.length) setActive(0);
        } else {
          setActive(activeIndex + 1);
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowUp') {
        if (open) { setActive(activeIndex - 1); e.preventDefault(); }
        return;
      }

      if (e.key === 'Enter') {
        // 候補を選んでいるときだけ確定に使う。
        // 何も選んでいなければフォーム送信を邪魔しない（自由入力の尊重）。
        if (open && activeIndex >= 0) {
          choose(activeIndex);
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (open) { close(); e.preventDefault(); }
        return;
      }

      if (e.key === 'Tab') {
        // フォーカスが外れるので閉じるだけ。値は変えない。
        close();
      }
    });

    /* --- マウス / タップ --- */
    // mousedown を使う理由: click だと先に input の blur が走り、
    // リストが閉じてしまって選択できないことがあるため。
    list.addEventListener('mousedown', function (e) {
      var li = e.target && e.target.closest ? e.target.closest('.u-ac__item') : null;
      if (!li) return;
      e.preventDefault();
      choose(Number(li.getAttribute('data-index')));
    });

    list.addEventListener('mousemove', function (e) {
      var li = e.target && e.target.closest ? e.target.closest('.u-ac__item') : null;
      if (!li) return;
      setActive(Number(li.getAttribute('data-index')));
    });

    input.addEventListener('blur', function () {
      // 候補のクリック処理が終わるのを待ってから閉じる
      global.setTimeout(close, 120);
    });
  }

  /* ------------------------------------------------------------------
   *  起動
   * ------------------------------------------------------------------ */
  function init() {
    var inputs = doc.querySelectorAll('[data-autocomplete]');
    if (!inputs.length) return;

    var A = global.SippoAffiliate;
    if (!A) return;

    // 商品マスターを読み込んでから候補を使えるようにする。
    // 失敗しても入力欄は普通のテキスト入力として使えるまま（診断は動く）。
    A.init().then(function () {
      for (var i = 0; i < inputs.length; i++) setup(inputs[i]);
    }, function () {
      /* マスターが読めない場合は自由入力のまま。何もしない。 */
    });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* テスト・再利用のために公開する */
  global.SippoAutocomplete = {
    normalize: normalize,
    buildItems: buildItems,
    filterItems: filterItems,
  };
})(typeof window !== 'undefined' ? window : this);
