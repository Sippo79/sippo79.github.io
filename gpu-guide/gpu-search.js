/* =====================================================================
 *  GPU GUIDE ヘッダー検索（gpu-search.js）
 *  ---------------------------------------------------------------------
 *  ヘッダー（スクロールしても上に固定）に🔍ボタンを差し込み、
 *  どのページからでも GPU名で検索 → 個別ページ /gpu-guide/gpu/<id>/ へ移動できる。
 *
 *  - トップ / gpu.html / GPU個別ページ（65件・生成物）の全部で読む。
 *    パスはすべて絶対パス（/gpu-guide/...）なので置き場所の深さに依存しない。
 *  - gpus.json は初めて開いたときにだけ読む（ページ表示を重くしない）。
 *  - トップでは「比較表で絞り込む」も選べる（既存の #gpuSearch に入れて比較表へ移動）。
 *  - 読み込みに失敗しても、ボタンが出ない／比較表へ案内するだけでページは壊さない。
 *  - キーボード: 「/」で開く、↑↓で選択、Enterで移動、Escで閉じる。
 * ===================================================================== */
(function () {
  'use strict';

  var DATA_URL = '/gpu-guide/gpus.json';
  var DETAIL_URL = function (id) { return '/gpu-guide/gpu/' + id + '/'; };
  var MAX_RESULTS = 8;

  var nav = document.querySelector('.site-header .header-nav');
  if (!nav || document.querySelector('.gpu-qs-toggle')) return;

  var gpus = null;
  var loading = null;
  var activeIndex = -1;
  var currentItems = [];

  // 表記ゆれの吸収（index.html の ?gpu= 解決と同じ規則）
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/geforce\s*/g, '')
      .replace(/amd\s*radeon\s*/g, '')
      .replace(/radeon\s*/g, '')
      .replace(/amd\s*/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function loadGpus() {
    if (gpus) return Promise.resolve(gpus);
    if (loading) return loading;
    loading = fetch(DATA_URL)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        gpus = (Array.isArray(list) ? list : []).filter(function (g) { return g && g.id && g.name; })
          .map(function (g) {
            return { gpu: g, key: normalize(g.name), idKey: String(g.id).replace(/[^a-z0-9]/g, '') };
          });
        return gpus;
      })
      .catch(function () { gpus = []; return gpus; });
    return loading;
  }

  function search(query) {
    var q = normalize(query);
    if (!q || !gpus) return [];
    var hits = [];
    gpus.forEach(function (row) {
      var pos = row.key.indexOf(q);
      if (pos < 0) pos = row.idKey.indexOf(q);
      if (pos < 0) return;
      hits.push({ row: row, rank: pos === 0 ? 0 : 1 });
    });
    hits.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      // 同じ条件なら新しめ・強いGPU（スコア順）を先に
      return (b.row.gpu.score || 0) - (a.row.gpu.score || 0);
    });
    return hits.slice(0, MAX_RESULTS).map(function (h) { return h.row.gpu; });
  }

  /* ---------- DOM ---------- */
  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'gpu-qs-toggle';
  toggle.setAttribute('aria-label', 'GPUを検索');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'gpuQuickSearch');
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
    '<path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
    '<span class="gpu-qs-toggle__text">検索</span>';
  nav.appendChild(toggle);

  var panel = document.createElement('div');
  panel.id = 'gpuQuickSearch';
  panel.className = 'gpu-qs-panel';
  panel.hidden = true;
  panel.innerHTML =
    '<div class="container gpu-qs-inner">' +
    '  <div class="gpu-qs-field">' +
    '    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
    '      <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
    '    <input type="search" class="gpu-qs-input" placeholder="GPU名で検索：RTX 5070 / 9070 XT など"' +
    '      autocomplete="off" spellcheck="false" enterkeyhint="go"' +
    '      role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gpuQuickSearchList" aria-label="GPU名で検索" />' +
    '    <button type="button" class="gpu-qs-close" aria-label="検索を閉じる">✕</button>' +
    '  </div>' +
    '  <ul class="gpu-qs-list" id="gpuQuickSearchList" role="listbox" aria-label="検索結果"></ul>' +
    '  <p class="gpu-qs-hint">型番の一部だけでもOK（例：<kbd>5070</kbd>、<kbd>9070xt</kbd>）。選ぶとGPUの詳しいページが開きます。</p>' +
    '</div>';
  var header = nav.closest('.site-header');
  header.appendChild(panel);

  var input = panel.querySelector('.gpu-qs-input');
  var list = panel.querySelector('.gpu-qs-list');
  var hint = panel.querySelector('.gpu-qs-hint');
  var closeBtn = panel.querySelector('.gpu-qs-close');

  // トップの比較表（既存の検索欄）があるページだけ「比較表で絞り込む」を出す
  var compareInput = document.getElementById('gpuSearch');

  function render() {
    var q = input.value.trim();
    var results = search(q);
    currentItems = [];
    var html = '';

    results.forEach(function (g) {
      var meta = [];
      if (g.vram) meta.push('VRAM ' + g.vram + 'GB');
      if (g.target) meta.push(g.target + '向け');
      currentItems.push({ type: 'gpu', href: DETAIL_URL(g.id), id: g.id });
      html += '<li role="option" id="gpuQsOpt' + (currentItems.length - 1) + '" class="gpu-qs-item" data-index="' + (currentItems.length - 1) + '">' +
        '<a href="' + DETAIL_URL(escapeHtml(g.id)) + '" tabindex="-1">' +
        '<span class="gpu-qs-item__brand gpu-qs-item__brand--' + (g.brand === 'AMD' ? 'amd' : 'nvidia') + '">' + escapeHtml(g.brand === 'AMD' ? 'AMD' : 'NVIDIA') + '</span>' +
        '<span class="gpu-qs-item__name">' + escapeHtml(g.name) + '</span>' +
        '<span class="gpu-qs-item__meta">' + escapeHtml(meta.join('・')) + '</span>' +
        '</a></li>';
    });

    if (q && compareInput) {
      currentItems.push({ type: 'compare', query: q });
      html += '<li role="option" id="gpuQsOpt' + (currentItems.length - 1) + '" class="gpu-qs-item gpu-qs-item--compare" data-index="' + (currentItems.length - 1) + '">' +
        '<a href="#compare" tabindex="-1">比較表で「' + escapeHtml(q) + '」を絞り込む →</a></li>';
    }

    if (q && !results.length) {
      html = '<li class="gpu-qs-empty">' + (gpus === null ? '読み込み中…' : '「' + escapeHtml(q) + '」に一致するGPUが見つかりませんでした') + '</li>' + html;
    }

    list.innerHTML = html;
    hint.hidden = !!q;
    input.setAttribute('aria-expanded', currentItems.length ? 'true' : 'false');
    setActive(currentItems.length ? 0 : -1);
  }

  function setActive(i) {
    activeIndex = i;
    var items = list.querySelectorAll('.gpu-qs-item');
    for (var k = 0; k < items.length; k++) {
      var on = Number(items[k].getAttribute('data-index')) === i;
      items[k].classList.toggle('is-active', on);
      items[k].setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && items[k].scrollIntoView) items[k].scrollIntoView({ block: 'nearest' });
    }
    if (i >= 0) input.setAttribute('aria-activedescendant', 'gpuQsOpt' + i);
    else input.removeAttribute('aria-activedescendant');
  }

  function choose(i) {
    var item = currentItems[i];
    if (!item) return;
    if (item.type === 'gpu') {
      // GA4：選ばれたGPUのIDだけを送る（入力した文字列は送らない）
      if (window.SippoAnalytics) window.SippoAnalytics.track('gpu_search_select', { gpu_id: item.id, source: 'header_search' });
      window.location.href = item.href;
      return;
    }
    // 比較表へ: 既存の検索欄に入れて script.js の絞り込みを動かす
    compareInput.value = item.query;
    compareInput.dispatchEvent(new Event('input', { bubbles: true }));
    close();
    var target = document.getElementById('compare');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function open() {
    if (!panel.hidden) { input.focus(); return; }
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.classList.add('is-open');
    input.focus();
    loadGpus().then(render);
  }

  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('is-open');
  }

  toggle.addEventListener('click', function () {
    if (panel.hidden) open(); else { close(); toggle.focus(); }
  });
  closeBtn.addEventListener('click', function () { close(); toggle.focus(); });

  input.addEventListener('input', function () {
    if (gpus === null) loadGpus().then(render);
    render();
  });

  input.addEventListener('keydown', function (e) {
    var n = currentItems.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (n) setActive((activeIndex + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setActive((activeIndex - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) choose(activeIndex);
    } else if (e.key === 'Escape') {
      close();
      toggle.focus();
    }
  });

  list.addEventListener('click', function (e) {
    var li = e.target.closest('.gpu-qs-item');
    if (!li) return;
    e.preventDefault();
    choose(Number(li.getAttribute('data-index')));
  });
  list.addEventListener('mousemove', function (e) {
    var li = e.target.closest('.gpu-qs-item');
    if (li) {
      var i = Number(li.getAttribute('data-index'));
      if (i !== activeIndex) setActive(i);
    }
  });

  // パネルの外を押したら閉じる
  document.addEventListener('click', function (e) {
    if (panel.hidden) return;
    if (panel.contains(e.target) || toggle.contains(e.target)) return;
    close();
  });

  // 「/」でどこからでも検索を開く（入力中は除く）
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    e.preventDefault();
    open();
  });
})();
