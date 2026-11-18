/**
 * 共通アフィリエイトの商品カードの検証（node scripts/test-affiliate-cards.js）
 *
 *  1. 商品マスター: linkType:"exact" の直リンクには、遷移先の製品（item）が記録されている。
 *     item の製品名が、その商品（GPU名）と一致する（RTX 4070 の欄に RTX 4070 SUPER を置かない）。
 *     写真（image）は利用条件（source / license）付きの https URL か null。
 *  2. 描画（shared/affiliate/affiliate.js を偽のブラウザ環境で実行）
 *     - 直リンク＋item → 商品カード（メーカー名・製品名・「楽天市場で商品を見る」）
 *     - 検索リンク → 「RX 9070搭載製品をAmazonで探す」のように検索と分かる文言・写真なし
 *     - 写真あり／なし／利用条件なし／提供元のリンク指定と不一致 の出し分け
 *     - 同じ製品のリンクだけを1枚にまとめる
 *     - すべてのリンクが従来と同じ計測属性を1組だけ持つ（affiliate_click の二重計上なし）
 *     - 長い型番・HTML特殊文字のエスケープ
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) { if (cond) pass++; else { fail++; failures.push(name + (detail ? '  → ' + detail : '')); } }

const master = JSON.parse(read('shared/affiliate/affiliate-master.json'));
const P = master.products;

/* ================= 1. 商品マスター ================= */
const SHOPS = ['amazon', 'rakuten', 'yahoo'];
// GPU名の直後に来たら「別のGPU」になる語（RTX 4070 → RTX 4070 SUPER 等）
const VARIANT = /^(super|ti|xt|xtx|gre)$/i;

function nameMatchesProduct(product, itemName) {
  const want = String(product.shortName || '').toLowerCase().split(/\s+/).filter(Boolean);
  const words = String(itemName).toLowerCase().split(/\s+/).filter(Boolean);
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => words[i + k] === w)) {
      const next = words[i + want.length] || '';
      return !VARIANT.test(next);
    }
  }
  return false;
}

let itemCount = 0;
for (const [id, p] of Object.entries(P)) {
  for (const shop of SHOPS) {
    const s = p[shop] || {};
    if (s.url && s.linkType === 'exact') {
      ok(`直リンクに遷移先の製品が記録されている: ${id}.${shop}`, Boolean(s.item && s.item.name && s.item.maker));
    }
    if (!s.item) continue;
    itemCount++;
    const it = s.item;
    // item は直リンク（exact）か、発行画像リンクだけで紹介する製品（image-only・url は空）にだけ付ける
    ok(`item は直リンク（または画像リンクだけの製品）にだけ付ける: ${id}.${shop}`,
      (Boolean(s.url) && s.linkType === 'exact') || (shop === 'rakuten' && s.linkType === 'image-only' && !s.url && Boolean(it.imageLink)));
    if (s.linkType === 'image-only') {
      ok(`画像リンクだけの製品: 外した旧リンクを url に残さない: ${id}.${shop}`, !s.url && (!s.previousUrl || /^https:\/\//.test(s.previousUrl)));
      ok(`画像リンクだけの製品: 行き先は発行リンクの転送先と同じ: ${id}.${shop}`, it.destination === it.imageLink.destination && it.destinationType === 'item');
    }
    ok(`item に確認日と遷移先がある: ${id}.${shop}`, /^\d{4}-\d{2}-\d{2}$/.test(it.checkedAt || '') && /^https:\/\//.test(it.destination || ''));
    if (p.category === 'gpu') ok(`製品名がGPU名と一致: ${id}.${shop}`, nameMatchesProduct(p, it.name), `${p.shortName} ⇔ ${it.name}`);
    if (it.imageLink) {
      const L = it.imageLink;
      const pc = decodeURIComponent(((L.html || '').match(/[?&]pc=([^&"]+)/) || [])[1] || '');
      ok(`発行画像リンクは「画像のみ」128×128: ${id}.${shop}`, L.type === 'rakuten-pict' && L.size === '128x128'
        && L.html.includes('link_type=pict&') && L.html.includes('&s=128x128&t=pict"'));
      ok(`発行画像リンクの転送先が destination と一致: ${id}.${shop}`, pc === L.destination, pc);
      ok(`発行画像リンクに確認日と転送先の商品名: ${id}.${shop}`, /^\d{4}-\d{2}-\d{2}$/.test(L.checkedAt || '') && Boolean(L.destinationTitle));
      ok(`発行画像リンクの転送先商品名が製品と一致（OC・型番）: ${id}.${shop}`,
        String(L.destinationTitle).toLowerCase().includes(String(it.name).toLowerCase().split(' ').slice(-2).join(' ')),
        L.destinationTitle);
      ok(`発行画像リンクは訳あり品ではない: ${id}.${shop}`, !/(訳あり|外箱|中古|アウトレット|ジャンク)/.test(L.destinationTitle));
    }
    ok(`行き先の種類が遷移先URLと一致: ${id}.${shop}`,
      it.destinationType === (/^https:\/\/product\.rakuten\.co\.jp\/product\//.test(it.destination) ? 'compare' : 'item'), `${it.destinationType} ${it.destination}`);
    if (it.imageLinkHeld) {
      ok(`保留した発行リンクは表示用の html を持たない: ${id}.${shop}`, !it.imageLinkHeld.html && !it.imageLink && Boolean(it.imageLinkHeld.reason));
    }
    const img = it.image;
    ok(`写真は null か利用条件付き: ${id}.${shop}`, img === null || img === undefined
      || (/^https:\/\//.test(img.src || '') && img.source && img.license));
  }
  // retiredUrl は表示に使われない控え。url と同じ値が残っていないこと
  for (const shop of SHOPS) {
    const s = p[shop] || {};
    if (s.retiredUrl) ok(`退避したURLを url に残していない: ${id}.${shop}`, s.url !== s.retiredUrl);
  }
}
ok('item のある直リンクが1件以上ある', itemCount > 0, String(itemCount));
// 名前照合の自己テスト（誤りを確実に検出できること）
ok('照合: RTX 4070 と RTX 4070 SUPER を区別', !nameMatchesProduct({ shortName: 'RTX 4070' }, 'GeForce RTX 4070 SUPER 12G VENTUS 3X OC'));
ok('照合: RTX 5070 Ti は 16G が続いても一致', nameMatchesProduct({ shortName: 'RTX 5070 Ti' }, 'GeForce RTX 5070 Ti 16G VENTUS 3X PZ OC'));
ok('照合: RX 9070 と RX 9070 XT を区別', !nameMatchesProduct({ shortName: 'RX 9070' }, 'Radeon RX 9070 XT Steel Legend 16G'));

/* ================= 2. 描画 ================= */
function load(products) {
  const sandbox = {
    console, fetch: () => Promise.reject(new Error('no fetch')),
    location: { protocol: 'https:', pathname: '/gpu-guide/gpu/rtx-5070/' },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('shared/affiliate/affiliate-config.js'), sandbox);
  vm.runInContext(read('shared/affiliate/affiliate.js'), sandbox);
  const A = sandbox.SippoAffiliate;
  for (const [id, def] of Object.entries(products)) A.addAffiliateProduct(id, def);
  // addAffiliateProduct は item を落とさない（ショップノードをそのまま使う）ことを前提にする
  return A;
}

const A = load(JSON.parse(JSON.stringify(P)));
const opts = { page: 'gpu-guide', placement: 'gpu-detail-purchase' };
const anchors = (html) => html.match(/<a [^>]*>/g) || [];
const TRACK = ['data-affiliate-track', 'data-affiliate-product', 'data-affiliate-name', 'data-affiliate-shop', 'data-affiliate-page', 'data-affiliate-placement'];
const ISSUED_HREF = 'href="https://hb.afl.rakuten.co.jp/';
function trackOnce(name, html) {
  // 楽天の発行HTMLの <a> は改変禁止なので計測属性を持たない（外側の枠で数える。下の (f) で検証）
  for (const a of anchors(html).filter((x) => !x.includes(ISSUED_HREF))) {
    ok(`${name}: 計測属性が1組だけ`, TRACK.every((t) => a.split(t + '=').length === 2), a.slice(0, 120));
    ok(`${name}: target/rel を維持`, a.includes('target="_blank"') && a.includes('rel="nofollow sponsored noopener noreferrer"'));
  }
}

// (a) 画像リンクだけで紹介する製品（RTX 5070 → MSI 12G VENTUS 2X OC / VD9071）
{
  const html = A.renderAffiliateButtons('rtx5070', opts);
  const it = P.rtx5070.rakuten.item;
  ok('rtx5070: 商品カードが1枚', (html.match(/class="sippo-aff-item[ "]/g) || []).length === 1);
  ok('rtx5070: OC を含む製品名と型番を表示', it.name === 'GeForce RTX 5070 12G VENTUS 2X OC' && it.model === 'VD9071'
    && html.includes('>' + it.maker + '<') && html.includes('>' + it.name + '<') && html.includes('>VD9071<'));
  ok('rtx5070: 発行HTMLをそのまま写真にする（SPW楽天市場店）', html.split(it.imageLink.html).length === 2 && it.imageLink.destination === 'https://item.rakuten.co.jp/speedwagon/10014480/');
  ok('rtx5070: 旧モデル（OCなし）の価格比較ボタンを出さない', !html.includes(P.rtx5070.rakuten.previousUrl) && !html.includes('a.r10.to') && !html.includes('価格を比較') && !html.includes('楽天市場で商品を見る'));
  ok('rtx5070: 楽天の検索リンクも作らない', !html.includes('search.rakuten') && !html.includes('hb.afl.rakuten.co.jp/hgc/') && !html.includes('楽天市場で探す'));
  ok('rtx5070: 写真を押すと楽天のショップページが開くことを案内', html.includes('>商品画像を押すと、楽天市場のショップページが開きます<'));
  ok('rtx5070: 写真付きの形', html.includes('sippo-aff-item--issued') && !html.includes('sippo-aff-item--noimg'));
  ok('rtx5070: テーマ（GPU名）と製品を区別する表記', html.includes('RTX 5070搭載の一製品'));
  ok('rtx5070: Amazonは検索と分かる文言', html.includes('RTX 5070搭載製品をAmazonで探す') && html.includes('特定の商品ではありません'));
  ok('rtx5070: Amazonの短縮リンクを維持', html.includes('href="' + P.rtx5070.amazon.url + '"'));
  ok('rtx5070: 広告表記を維持', html.includes('【PR】'));
  trackOnce('rtx5070', html);
  // 一覧（compact）では写真を出さないので、画像リンクだけの製品は出さない（旧モデルの名前・リンクも出ない）
  const list = A.renderProductList([{ label: 'GPU', name: 'RTX 5070' }], { page: 'pc-build-check', placement: 'build-result' });
  ok('rtx5070 一覧: 製品カード・楽天リンクを出さず、検索ボタンだけ', !list.includes('sippo-aff-item') && !list.includes('rakuten') && !list.includes('VENTUS') && list.includes('>Amazonで探す<'));
  const cmp = A.renderAffiliateButtons('rtx5070', Object.assign({ compact: true }, opts));
  ok('rtx5070 compact（PC BUILDER）: 写真・旧リンクを出さない', !cmp.includes('<img') && !cmp.includes('a.r10.to') && !cmp.includes('VENTUS'));
  // 販売停止（sold-out）にしたら写真リンクも出さず、楽天は検索へ逃がす
  const so = load({});
  so.addAffiliateProduct('rtx5070', Object.assign(JSON.parse(JSON.stringify(P.rtx5070)), { rakuten: Object.assign({}, P.rtx5070.rakuten, { status: 'sold-out' }) }));
  const hso = so.renderAffiliateButtons('rtx5070', opts);
  ok('rtx5070 sold-out: 写真リンクを出さず楽天は検索', !hso.includes('hbb.afl.rakuten') && hso.includes('RTX 5070搭載製品を楽天市場で探す'));
}
{
  const html = A.renderAffiliateButtons('rtx5060', opts);
  const it = P.rtx5060.rakuten.item;
  ok('rtx5060: OC V1 を含む製品名（型番はページに記載なしのため空）', it.name === 'GeForce RTX 5060 8G VENTUS 2X OC V1' && !it.model && it.jan === '4711377460880'
    && html.includes('>' + it.name + '<') && !html.includes('sippo-aff-item-model'));
  ok('rtx5060: 発行HTMLをそのまま写真にする（パソコン工房）', html.split(it.imageLink.html).length === 2 && it.imageLink.destination === 'https://item.rakuten.co.jp/pckoubou/m4s1p1263192/');
  ok('rtx5060: 旧モデルの価格比較ボタンを出さない', !html.includes(P.rtx5060.rakuten.previousUrl) && !html.includes('価格を比較') && !html.includes('楽天市場で探す'));
  ok('rtx5060: 写真の案内', html.includes('>商品画像を押すと、楽天市場のショップページが開きます<') && html.includes('sippo-aff-item--issued'));
  trackOnce('rtx5060', html);
}

// (b) 検索だけ（RX 9070）→ カードなし・写真なし
{
  const html = A.renderAffiliateButtons('rx9070', opts);
  ok('rx9070: カードを出さない', !html.includes('sippo-aff-item'));
  ok('rx9070: 写真を出さない', !html.includes('<img'));
  ok('rx9070: 「RX 9070搭載製品をAmazonで探す」', html.includes('RX 9070搭載製品をAmazonで探す'));
  ok('rx9070: 楽天は検索（sold-out の控えURLを使わない）', !html.includes(P.rx9070.rakuten.retiredUrl) && html.includes('RX 9070搭載製品を楽天市場で探す'));
  trackOnce('rx9070', html);
}

// (c) 別製品を指していたリンクは表示しない
for (const id of ['rtx4060ti', 'rtx4070', 'rtx4070tisuper', 'rtx4080super']) {
  const html = A.renderAffiliateButtons(id, opts);
  ok(`${id}: 退避した直リンクを出さない`, !html.includes(P[id].rakuten.retiredUrl || '(none)'));
  ok(`${id}: 商品カードを出さない`, !html.includes('sippo-aff-item'));
}

// (d) 一覧（compact）は短い文言で1行に
{
  const html = A.renderProductList([{ label: 'GPU', name: 'RTX 4060' }], { page: 'pc-build-check', placement: 'build-result' });
  ok('一覧: カードは compact', html.includes('sippo-aff-compact') && html.includes('sippo-aff-item'));
  ok('一覧: 検索ボタンは「Amazonで探す」', html.includes('>Amazonで探す<'));
  trackOnce('一覧', html);
}

// (e) 写真・まとめ方・エスケープ（テスト用の商品）
{
  const B = load({});
  const img = { src: 'https://example.org/p.jpg', width: 500, height: 200, source: 'テスト', license: 'テスト用' };
  B.addAffiliateProduct('t-img', {
    name: 'GeForce RTX 9999', shortName: 'RTX 9999', category: 'gpu', status: 'active',
    amazon: { url: 'https://amzn.to/AAA', linkType: 'exact', item: { maker: 'X', name: 'GeForce RTX 9999 <b>LONG</b>', model: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJ', destination: 'https://x/', checkedAt: '2026-11-18', image: img } },
    rakuten: { url: 'https://a.r10.to/BBB', linkType: 'exact', item: { maker: 'X', name: 'GeForce RTX 9999 <b>LONG</b>', model: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJ', destination: 'https://y/', checkedAt: '2026-11-18', image: null } },
    yahoo: { url: 'https://yahoo.jp/CCC', linkType: 'exact', item: { maker: 'Y', name: 'GeForce RTX 9999 OTHER', destination: 'https://z/', checkedAt: '2026-11-18', image: null } },
  });
  const html = B.renderAffiliateButtons('t-img', opts);
  ok('まとめ: 同じ製品の Amazon と楽天は1枚、別製品の Yahoo は別カード', (html.match(/class="sippo-aff-item[ "]/g) || []).length === 2);
  ok('写真: 利用条件ありは表示（lazy・contain用クラス）', html.includes('<img class="sippo-aff-item-img" src="https://example.org/p.jpg"') && html.includes('loading="lazy"'));
  ok('写真: 写真の枠は1つだけ', (html.match(/<img /g) || []).length === 1);
  ok('長い型番を表示', html.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJ'));
  ok('製品名をエスケープ', html.includes('&lt;b&gt;LONG&lt;/b&gt;') && !html.includes('<b>LONG'));
  ok('ほかのリンクが無いときは検索見出しを出さない', !html.includes('sippo-aff-subheading'));
  trackOnce('テスト商品', html);

  // 利用条件の無い写真 → 出さない
  B.addAffiliateProduct('t-nolicense', {
    name: 'GeForce RTX 9998', shortName: 'RTX 9998', category: 'gpu', status: 'active',
    rakuten: { url: 'https://a.r10.to/DDD', linkType: 'exact', item: { maker: 'X', name: 'GeForce RTX 9998 A', image: { src: 'https://example.org/q.jpg' } } },
    amazon: { enabled: false }, yahoo: {},
  });
  const h2 = B.renderAffiliateButtons('t-nolicense', opts);
  ok('写真: 利用条件が無ければ出さない', !h2.includes('<img') && h2.includes('sippo-aff-item--noimg'));

  // 提供元のリンク指定（href）がボタンと一致 → 写真もリンク（計測属性付き）、不一致 → 写真を出さない
  const mk = (href) => ({ src: 'https://example.org/r.jpg', source: 's', license: 'l', href });
  B.addAffiliateProduct('t-href-ok', { name: 'GeForce RTX 9997', shortName: 'RTX 9997', category: 'gpu', status: 'active',
    rakuten: { url: 'https://a.r10.to/EEE', linkType: 'exact', item: { maker: 'X', name: 'GeForce RTX 9997 A', image: mk('https://a.r10.to/EEE') } }, amazon: { enabled: false }, yahoo: {} });
  B.addAffiliateProduct('t-href-ng', { name: 'GeForce RTX 9996', shortName: 'RTX 9996', category: 'gpu', status: 'active',
    rakuten: { url: 'https://a.r10.to/FFF', linkType: 'exact', item: { maker: 'X', name: 'GeForce RTX 9996 A', image: mk('https://hb.afl.rakuten.co.jp/other') } }, amazon: { enabled: false }, yahoo: {} });
  const h3 = B.renderAffiliateButtons('t-href-ok', opts);
  const h4 = B.renderAffiliateButtons('t-href-ng', opts);
  ok('写真: 指定リンクと一致すれば写真をリンクにする', /<a class="sippo-aff-item-media"[^>]*href="https:\/\/a\.r10\.to\/EEE"/.test(h3));
  trackOnce('写真リンク', h3);
  ok('写真: 指定リンクと不一致なら写真を出さない', !h4.includes('<img') && h4.includes('sippo-aff-item--noimg'));
}

// (f) 楽天で発行した「画像のみ」リンク（item.imageLink）
{
  const it = P.rtx3080.rakuten.item;
  const L = it.imageLink;
  const html = A.renderAffiliateButtons('rtx3080', opts);
  ok('発行画像: 発行HTMLを1文字も変えずに含む', html.split(L.html).length === 2);
  ok('発行画像: 写真付きカードの形（写真なし扱いにしない）', html.includes('sippo-aff-item--issued') && !html.includes('sippo-aff-item--noimg'));
  ok('発行画像: 独自の <img> を作らない（img は発行HTMLの1つだけ）', (html.match(/<img /g) || []).length === 1);
  const wrap = (html.match(/<div class="sippo-aff-item-media sippo-aff-item-media--issued"[^>]*>/) || [''])[0];
  ok('発行画像: 外側の枠に計測属性が1組', ['data-affiliate-wrap', 'data-affiliate-product="rtx3080"', 'data-affiliate-shop="rakuten"', 'data-affiliate-page="gpu-guide"', 'data-affiliate-placement="gpu-detail-purchase"'].every((t) => wrap.split(t).length === 2), wrap);
  ok('発行画像: 枠自体はリンクではない（二重計測しない）', !wrap.includes('href=') && !wrap.includes('data-affiliate-track'));
  ok('発行画像: 販売店ボタンは従来の短縮リンクのまま', html.includes('href="' + P.rtx3080.rakuten.url + '"'));
  ok('発行画像: 型番を表示', html.includes('>' + it.model + '<'));
  trackOnce('発行画像', html);

  const list = A.renderProductList([{ label: 'GPU', name: 'RTX 3080' }], { page: 'pc-build-check', placement: 'build-result' });
  ok('発行画像: 一覧（compact）では写真を出さない', list.includes('sippo-aff-item') && !list.includes('hbb.afl.rakuten') && !list.includes('<img'));
  const cmp = A.renderAffiliateButtons('rtx3080', Object.assign({ compact: true }, opts));
  ok('発行画像: compact 指定（PC BUILDER）でも写真を出さない', !cmp.includes('<img'));

  // 改変されたHTMLは使わない（写真なしのカードに戻る）
  const tamper = {
    'width属性の追加': L.html.replace('<img ', '<img width="96" '),
    'サイズ違い': L.html.replace('s=128x128', 's=240x240'),
    '画像＋テキスト': L.html.replace('link_type=pict', 'link_type=picttext'),
    '属性の削除': L.html.replace(' rel="nofollow sponsored noopener"', ''),
    'スクリプト混入': L.html + '<script>alert(1)</script>',
    '別の転送先': L.html.replace('ayhrpsrksx', 'zzzzzzzzzz'),
  };
  for (const [label, bad] of Object.entries(tamper)) {
    const C = load({ rtx3080: JSON.parse(JSON.stringify(P.rtx3080)) });
    C.addAffiliateProduct('rtx3080', Object.assign(JSON.parse(JSON.stringify(P.rtx3080)), {
      rakuten: Object.assign({}, P.rtx3080.rakuten, { item: Object.assign({}, it, { imageLink: Object.assign({}, L, { html: bad }) }) }),
    }));
    const h = C.renderAffiliateButtons('rtx3080', opts);
    ok(`発行画像: 改変（${label}）は使わない`, !h.includes('hbb.afl.rakuten') && h.includes('sippo-aff-item--noimg'));
  }

  // ボタンの文言は実際の行き先に合わせる
  ok('文言: 特定ショップの商品ページ（RTX 3080）は「楽天市場で商品を見る」', html.includes('>楽天市場で商品を見る<') && !html.includes('価格を比較'));
  const h4060 = A.renderAffiliateButtons('rtx4060', opts);
  ok('文言: 価格比較ページ（RTX 4060）は「楽天市場で価格を比較」', h4060.includes('>楽天市場で価格を比較<') && h4060.includes('複数ショップの価格比較ページが開きます') && !h4060.includes('楽天市場で商品を見る'));
  ok('文言: 写真はショップ直行・ボタンは価格比較（RTX 4060）', h4060.includes(P.rtx4060.rakuten.item.imageLink.html) && h4060.includes('href="' + P.rtx4060.rakuten.url + '"'));
  ok('文言: 検索リンクは引き続き「探す」', h4060.includes('RTX 4060搭載製品をAmazonで探す') && h4060.includes('特定の商品ではありません'));
  trackOnce('価格比較カード', h4060);
  for (const id of ['rtx5080', 'rx9070xt']) {
    ok(`文言: ${id} は「楽天市場で価格を比較」`, A.renderAffiliateButtons(id, opts).includes('>楽天市場で価格を比較<'));
  }
  const h5070ti = A.renderAffiliateButtons('rtx5070ti', opts);
  ok('RTX 5070 Ti: 写真付き・「楽天市場で商品を見る」', h5070ti.includes(P.rtx5070ti.rakuten.item.imageLink.html) && h5070ti.includes('>楽天市場で商品を見る<'));
  ok('販売状態: 並行輸入品の注記を詳細カードに表示', h5070ti.includes('並行輸入品') && html.includes('並行輸入品') && !h4060.includes('並行輸入品'));
  const listCmp = A.renderProductList([{ label: 'GPU', name: 'RTX 4060' }, { label: 'GPU', name: 'RTX 3080' }], { page: 'pc-build-check', placement: 'build-result' });
  ok('一覧: 価格比較は「楽天市場で価格を比較」、販売状態の注記は出さない', listCmp.includes('>楽天市場で価格を比較<') && listCmp.includes('>楽天市場で商品を見る<') && !listCmp.includes('並行輸入品'));
  // 写真のない製品は従来どおり（発行画像を外した RTX 4060 で確認）
  const N = load({});
  N.addAffiliateProduct('rtx4060', Object.assign(JSON.parse(JSON.stringify(P.rtx4060)), {
    rakuten: Object.assign({}, P.rtx4060.rakuten, { item: Object.assign({}, P.rtx4060.rakuten.item, { imageLink: undefined }) }),
  }));
  const hNo = N.renderAffiliateButtons('rtx4060', opts);
  ok('発行画像: 未登録の製品は写真なしのまま', hNo.includes('sippo-aff-item--noimg') && !hNo.includes('<img') && hNo.includes('>楽天市場で価格を比較<'));
  // 画像リンクだけの製品でも、発行HTMLが壊れていればカードを出さない（行き先のない製品名を出さない）
  const B = load({});
  const badItem = Object.assign({}, P.rtx5060.rakuten.item, { imageLink: Object.assign({}, P.rtx5060.rakuten.item.imageLink, { html: P.rtx5060.rakuten.item.imageLink.html.replace('<img ', '<img width="96" ') }) });
  B.addAffiliateProduct('rtx5060', Object.assign(JSON.parse(JSON.stringify(P.rtx5060)), { rakuten: Object.assign({}, P.rtx5060.rakuten, { item: badItem }) }));
  const hBad = B.renderAffiliateButtons('rtx5060', opts);
  ok('画像リンクだけの製品: 発行HTMLが改変されていればカードを出さない', !hBad.includes('sippo-aff-item') && !hBad.includes('VENTUS') && hBad.includes('RTX 5060搭載製品をAmazonで探す'));
}

/* ================= 3. CSS ================= */
{
  const css = read('shared/affiliate/affiliate.css');
  ok('CSS: 写真は切り落とさず全体を表示（contain）', /\.sippo-aff-item-img\s*\{[^}]*object-fit:\s*contain/.test(css));
  ok('CSS: 製品名・型番は折り返す', /\.sippo-aff-item-name\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css) && /\.sippo-aff-item-model\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css));
  ok('CSS: 写真なしの形がある', css.includes('.sippo-aff-item--noimg'));
  const issuedImg = (css.match(/\.sippo-aff-item-media--issued img\s*\{[^}]*\}/g) || []).join('');
  ok('CSS: 発行画像を拡縮しない（width/height/object-fit/transform を当てない）', issuedImg && !/(^|[;{\s])(width|height|object-fit|transform|zoom)\s*:/.test(issuedImg.replace(/max-width:\s*none;?/, '')), issuedImg);
  ok('CSS: 発行画像の列は 132px（128px＋余白2px×2）', /\.sippo-aff-item--issued\s*\{[^}]*132px/.test(css));
  ok('CSS: 写真の案内文のスタイルがある', /\.sippo-aff-item-hint\s*\{/.test(css));
}

console.log(`商品カードの検証: ${pass} 件成功 / ${fail} 件失敗（item 付き直リンク ${itemCount} 件）`);
if (fail) { failures.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
