#!/usr/bin/env node
'use strict';
/**
 * 共通パーツデータ（shared/catalog/）→ 各サイトの生成物へ反映する。
 *
 *   node scripts/catalog/build.js           … 検証 → gpus.json・upgrade-engine.js の生成ブロック・revisions.json を更新
 *   node scripts/catalog/build.js --check   … 書き込まずに「生成物が正本と一致しているか」だけを確認（不一致なら終了コード1）
 *   node scripts/catalog/build.js --pages   … 上に加えて GPU GUIDE 個別ページ・UPGRADE 記事も再生成する
 *
 * 致命的な検証エラーがあると何も書き込まない（警告・未確認の値では止めない）。
 * PC BUILDER は shared/catalog/ を実行時に直接読むので、ここを通さなくても反映される。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('./lib.js');
const V = require('./validate.js');

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const pages = args.includes('--pages');
  const root = L.ROOT;

  // 正本だけの検証（生成物の一致はこのあと自分で直すので除く）
  const pre = V.validate({ root, generated: false });
  if (pre.summary.errors) {
    console.log(V.formatHuman(pre));
    console.error('\n致命的なエラーがあるため生成を中止しました（ファイルは変更していません）。');
    process.exit(1);
  }

  const { cat, outputs } = L.computeOutputs(root);
  let prev = null;
  try { prev = L.readJson(L.PATHS.revisions, root); } catch (e) { /* 初回 */ }
  const rev = L.computeRevisions(cat, prev, new Date());
  outputs[L.PATHS.revisions] = rev.json;

  const changed = [];
  for (const [rel, text] of Object.entries(outputs)) {
    let disk = null;
    try { disk = L.readText(rel, root); } catch (e) { /* 無い */ }
    const same = disk !== null && L.sameText(disk, text);
    if (!same) changed.push(rel);
    if (!same && !check) {
      // 改行コードは既存ファイルに合わせる（CRLF の作業コピーを LF に変えて不要な差分を出さない）
      const out = disk && disk.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text;
      fs.writeFileSync(path.join(root, rel), out);
    }
  }

  if (check) {
    if (changed.length) {
      console.error('生成物が正本と一致しません:\n' + changed.map((c) => '  - ' + c).join('\n') + '\n→ node scripts/catalog/build.js を実行してください。');
      process.exit(1);
    }
    console.log('OK: 生成物（gpus.json・upgrade-engine.js の生成ブロック・revisions.json）は正本と一致しています。');
    return;
  }

  console.log(changed.length ? '更新したファイル:\n' + changed.map((c) => '  - ' + c).join('\n') : '生成物に変更はありません。');
  if (rev.changed.length) {
    console.log('\n内容が変わったレコード（revisions.json の版を更新）:');
    rev.changed.slice(0, 30).forEach((c) => console.log(`  - ${c.key}: ${c.isNew ? '新規' : `版 ${c.from} → ${c.to}`}`));
    if (rev.changed.length > 30) console.log(`  …ほか ${rev.changed.length - 30}件`);
  }

  const gpuChanged = changed.includes(L.PATHS.gpusJson);
  const engineChanged = changed.includes(L.PATHS.engine);
  if (pages) {
    console.log('\nGPU GUIDE 個別ページを再生成します…');
    execFileSync(process.execPath, [path.join(root, 'gpu-guide', 'generate-gpu-pages.js')], { stdio: 'inherit' });
    console.log('\nUPGRADE 記事を再生成します…');
    execFileSync(process.execPath, [path.join(root, 'upgrade', 'generate-pages.js')], { stdio: 'inherit' });
  } else if (rev.changed.length || gpuChanged || engineChanged) {
    console.log('\n次に実行（静的ページへの反映）:');
    console.log('  node gpu-guide/generate-gpu-pages.js   … GPU GUIDE 個別ページ（価格・推奨電源・仕様）');
    console.log('  node upgrade/generate-pages.js         … UPGRADE 型番記事（推奨電源）');
    if (gpuChanged) console.log('  ※ gpus.json の rasterScore・price を変えた場合は PC BUILD CHECK（pc-build-check/generate-builds.ps1）と GAME PC GUIDE（game-pc-guide/generate-games.js）の再生成も必要。docs: shared/catalog/README.md');
    console.log('  （まとめて: node scripts/catalog/build.js --pages）');
  }

  const post = V.validate({ root });
  console.log(`\n検証: 致命的 ${post.summary.errors}件 / 要確認 ${post.summary.warnings}件 / 把握用 ${post.summary.infos}件（詳細: node scripts/catalog/validate.js）`);
  if (post.summary.errors) process.exitCode = 1;
}

main();
