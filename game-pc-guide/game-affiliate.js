/**
 * game-affiliate.js
 *
 * 読み込むJSON（games/*.html から見た相対パス）:
 *   ../data/game-affiliate.json        … ゲームごとの参照キー定義
 *   ../../●共通/affiliate/affiliate-master.json … URL本体・status の一元管理
 *
 * master が取得できない場合でも全ボタンを "準備中" で表示し、
 * game-affiliate.json 自体が取得できない場合のみ汎用フォールバックを表示する。
 */
(function () {
  'use strict';

  // monster-hunter.html → mhwilds のような例外マッピング
  var FILENAME_TO_ID = {
    'monster-hunter': 'mhwilds'
  };

  // ページのファイル名から gameId を導出する
  function getGameId() {
    var filename = location.pathname
      .split('/')
      .pop()
      .replace(/\.html$/, '');
    return FILENAME_TO_ID[filename] || filename;
  }

  // HTML 特殊文字をエスケープして XSS を防ぐ
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // masterData から url と status を解決する
  function resolveFromMaster(item, masterData) {
    var entry = masterData[item.masterCategory] && masterData[item.masterCategory][item.masterKey];
    return {
      url: entry ? entry.url : '',
      status: entry ? entry.status : 'preparing'
    };
  }

  // 個別ボタンの HTML を生成する
  function buildButton(item, masterData) {
    var type = esc(item.type || 'other');
    var label = esc(item.label || '');
    var desc  = esc(item.description || '');
    var resolved = resolveFromMaster(item, masterData);
    var isActive = resolved.status === 'active' && resolved.url;

    if (isActive) {
      return '<a'
        + ' class="affiliate-button affiliate-button-' + type + '"'
        + ' href="' + esc(resolved.url) + '"'
        + ' target="_blank"'
        + ' rel="noopener noreferrer sponsored"'
        + '>'
        + '<span>' + label + '</span>'
        + '<small>' + desc + '</small>'
        + '</a>';
    }

    return '<span'
      + ' class="affiliate-button affiliate-button-' + type + ' affiliate-button-disabled"'
      + ' aria-disabled="true"'
      + '>'
      + '<span>' + label + '</span>'
      + '<small>ショップ連携準備中</small>'
      + '<em>近日対応予定</em>'
      + '</span>';
  }

  // アフィリエイトセクション全体を描画する
  function renderSection(section, gameData, masterData) {
    var hasActive = gameData.items.some(function (item) {
      var resolved = resolveFromMaster(item, masterData);
      return resolved.status === 'active' && resolved.url;
    });

    var buttonsHtml = gameData.items.map(function (item) {
      return buildButton(item, masterData);
    }).join('');

    var disclosureHtml = hasActive
      ? '<p class="affiliate-disclosure">'
        + '当サイトではアフィリエイト広告を利用しています。リンク先で商品を購入すると、'
        + '運営者に収益が発生する場合があります。'
        + 'Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。'
        + '</p>'
      : '';

    var subText = hasActive
      ? '必要なスペックや周辺機器を、気になったタイミングで確認できます。'
      : '現在、販売サイトへのリンクを準備しています。公開後はこのエリアから確認できます。';

    section.innerHTML =
      '<div class="affiliate-heading">'
      + '<p class="section-label">SHOP LINKS</p>'
      + '<h2 id="affiliateTitle">' + esc(gameData.title) + '</h2>'
      + '<p>' + subText + '</p>'
      + '</div>'
      + '<div class="affiliate-link-grid">' + buttonsHtml + '</div>'
      + disclosureHtml;

    // JS 描画済みマークを付与 → CSS の自動非表示ルールから除外される
    section.setAttribute('data-affiliate', 'loaded');
  }

  // フェッチ失敗・gameId 未登録時のフォールバック表示
  function renderFallback(section) {
    section.innerHTML =
      '<div class="affiliate-heading">'
      + '<p class="section-label">SHOP LINKS</p>'
      + '<h2>ショップ連携準備中</h2>'
      + '<p>現在、販売サイトへのリンクを準備しています。公開後はこのエリアから確認できます。</p>'
      + '</div>';
    section.setAttribute('data-affiliate', 'loaded');
  }

  // メイン処理
  function init() {
    var section = document.querySelector('.affiliate-section');
    if (!section) return;

    var gameId = getGameId();
    // games/*.html からの相対パス
    var gameAffiliatePath = '../data/game-affiliate.json';
    var masterPath = '../../●共通/affiliate/affiliate-master.json';

    Promise.all([
      fetch(gameAffiliatePath).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }),
      // master が取得できなくても表示を継続する（準備中ボタンで描画）
      fetch(masterPath).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).catch(function (err) {
        console.warn('[game-affiliate] affiliate-master.json を取得できませんでした:', err.message);
        return {};
      })
    ])
    .then(function (results) {
      var gameAffiliateData = results[0];
      var masterData = results[1];
      var gameData = gameAffiliateData[gameId];
      if (gameData && Array.isArray(gameData.items) && gameData.items.length > 0) {
        renderSection(section, gameData, masterData);
      } else {
        renderFallback(section);
      }
    })
    .catch(function (err) {
      console.warn('[game-affiliate] game-affiliate.json の取得に失敗しました:', err.message);
      renderFallback(section);
    });
  }

  // DOM 構築後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
