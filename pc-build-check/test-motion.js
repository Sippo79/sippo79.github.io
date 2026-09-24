/* =====================================================================
 *  PC BUILD CHECK モーションのガードテスト (test-motion.js)
 *  ---------------------------------------------------------------------
 *  実行: node pc-build-check/test-motion.js
 *
 *  見た目の演出は壊れても機能テストでは気づけないので、
 *  「やりすぎ」と「reduced motion 漏れ」を静的に検出する。
 *   - 常時ループするアニメは許可したものだけ（背景の光・診断中のシッポ）
 *   - 診断演出の合計が1秒を超えない
 *   - reduced motion で遅延も0になる／演出を止める
 *   - 外部のアニメーションライブラリを読み込まない
 *   - レイアウトを揺らすプロパティ（width/height/top/left）をアニメさせない
 * ===================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var DIR = __dirname;
var css = fs.readFileSync(path.join(DIR, 'style.css'), 'utf8');
var js = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');
var html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

var pass = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) pass += 1;
  else failures.push(detail ? name + ' … ' + detail : name);
}

/* ---- 常時ループ ---- */
var infinite = [];
css.replace(/([^{}]+)\{([^{}]*animation[^{}]*infinite[^{}]*)\}/g, function (_, sel) {
  infinite.push(sel.trim().split('\n').pop().trim());
  return _;
});
var ALLOWED_INFINITE = ['.hero::before', '.pb-checking-sippo', '.skeleton-line', '.btn-loading::after', '.spinner'];
infinite.forEach(function (sel) {
  var allowed = ALLOWED_INFINITE.some(function (a) { return sel.indexOf(a) > -1; });
  check('常時ループは許可したものだけ: ' + sel, allowed);
});

/* ---- 診断演出の長さ ---- */
var step = js.match(/opts\.quick \? (\d+) : (\d+);\s*\n?\s*const holdMs = still \? 0 : opts\.quick \? (\d+) : (\d+);/);
check('診断演出の定数が読める', Boolean(step));
if (step) {
  var normal = Number(step[2]) * 3 + Number(step[4]);
  var quick = Number(step[1]) * 3 + Number(step[3]) + 180; // 旧結果のフェードアウト180ms込み
  check('通常の診断演出は1秒以内（' + normal + 'ms）', normal <= 1000);
  check('診断し直しの演出は1秒以内（' + quick + 'ms）', quick <= 1000);
}
var count = js.match(/const duration = (\d+);/);
check('価格カウントアップは0.5〜0.8秒', count && Number(count[1]) >= 500 && Number(count[1]) <= 800, count && count[1]);

/* ---- reduced motion ---- */
check('reduced motion で遅延も0にする', /prefers-reduced-motion: reduce\)[\s\S]*animation-delay: 0s !important/.test(css));
check('reduced motion で背景・Shine・足跡を止める', /prefers-reduced-motion: reduce\)[\s\S]*\.hero::before[\s\S]*\.pb-spec--gpu::after[\s\S]*\.pb-paws/.test(css));
['countUpPrice', 'showPawPrints', 'setupReveal', 'replayClass', 'leaveCurrentResult'].forEach(function (fn) {
  var body = js.slice(js.indexOf('function ' + fn), js.indexOf('\n}', js.indexOf('function ' + fn)));
  check('JSの演出が reduced motion を見る: ' + fn, body.indexOf('prefersReducedMotion()') > -1);
});

/* ---- ライブラリ・重いプロパティ ---- */
check('アニメーションライブラリを読み込まない', !/gsap|anime(\.min)?\.js|lottie|three(\.min)?\.js|framer-motion|velocity/i.test(html));
var keyframes = css.match(/@keyframes pb-[\s\S]*?\n\}/g) || [];
keyframes.forEach(function (k) {
  var name = k.match(/@keyframes ([\w-]+)/)[1];
  check('キーフレームはレイアウトを揺らさない: ' + name, !/(^|[\s{;])(width|height|top|left|margin|padding)\s*:/.test(k.replace(/@keyframes[^{]*\{/, '')));
});
check('毎フレーム更新は requestAnimationFrame の1か所だけ', (js.match(/requestAnimationFrame\(/g) || []).length <= 2);

console.log('');
console.log('  PC BUILD CHECK モーション ガードテスト');
console.log('  ------------------------------------');
console.log('  成功: ' + pass);
console.log('  失敗: ' + failures.length);
if (failures.length) {
  failures.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
console.log('');
