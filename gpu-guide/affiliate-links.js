// ============================================================
// [DEPRECATED] このファイルは廃止予定です
//
// GPU GUIDE は shared/affiliate/affiliate-master.json を参照する
// 方式へ移行しました（gpu-detail.js / script.js を参照）。
//
// このファイルは以下の安全確認が取れたあとに削除してください：
//   1. GitHub Pages 上で affiliate-master.json の fetch が成功すること
//   2. GPU詳細ページの購入リンクが正常に表示されること
//   3. game-pc-guide / pc-build-check の動作に影響がないこと
//
// 現時点では後方互換のため window.gpuAffiliateLinks の設定を残しています。
// script.js の旧方式関数（getGpuAffiliateLink 等）はこのデータを参照しますが、
// gpu-detail.js は新方式（masterData）を使っているため実質未参照です。
// ============================================================

const gpuAffiliateLinks = {
  "RTX 3060": createEmptyAffiliateLinks(),
  "RTX 3060 Ti": createEmptyAffiliateLinks(),
  "RTX 3070": createEmptyAffiliateLinks(),
  "RTX 3070 Ti": createEmptyAffiliateLinks(),
  "RTX 3080": createAffiliateLinks({
    rakuten: "https://a.r10.to/hPTDw0",
    amazon: "https://amzn.to/3REumeT",
    yahoo: "https://yahoo.jp/4pmjAN",
  }),
  "RTX 4060": createAffiliateLinks({
    rakuten: "https://a.r10.to/hkGGfE",
    amazon: "https://amzn.to/3PGja0D",
    yahoo: "https://yahoo.jp/JsWemN",
  }),
  "RTX 4060 Ti": createAffiliateLinks({
    rakuten: "https://a.r10.to/hFAAqX",
    amazon: "https://amzn.to/4f61LsH",
    yahoo: "https://yahoo.jp/9iTRo9",
  }),
  "RTX 4070": createAffiliateLinks({
    rakuten: "https://a.r10.to/h5lQoZ",
    amazon: "https://amzn.to/4dvaIe4",
    yahoo: "https://yahoo.jp/ifhvFWv",
  }),
  "RTX 4070 SUPER": createAffiliateLinks({
    rakuten: "https://a.r10.to/h5lHSz",
    yahoo: "https://yahoo.jp/NS8KBZ",
  }),
  "RTX 4070 Ti SUPER": createAffiliateLinks({
    rakuten: "https://a.r10.to/h53CJ4",
    amazon: "https://amzn.to/4f5qCgd",
    yahoo: "https://yahoo.jp/uVFwYk",
  }),
  "RTX 4080 SUPER": createAffiliateLinks({
    rakuten: "https://a.r10.to/hkys0x",
    amazon: "https://amzn.to/49fjwSO",
    yahoo: "https://yahoo.jp/Lsec9X",
  }),
  "RTX 5060": createAffiliateLinks({
    rakuten: "https://a.r10.to/hkpsZz",
    amazon: "https://amzn.to/49ODTWY",
    yahoo: "https://yahoo.jp/ztV_6C",
  }),
  "RTX 5060 Ti": createAffiliateLinks({
    rakuten: "https://a.r10.to/hFAAgo",
    amazon: "https://amzn.to/3RrYUR9",
    yahoo: "https://yahoo.jp/S2sFeH",
  }),
  "RTX 5070": createAffiliateLinks({
    rakuten: "https://a.r10.to/hkSdhv",
    amazon: "https://amzn.to/xxxxx",
    yahoo: "https://yahoo.jp/BRuvXb",
  }),
  "RTX 5070 Ti": createAffiliateLinks({
    rakuten: "https://a.r10.to/hPcwmv",
    amazon: "https://amzn.to/42RGjAw",
    yahoo: "https://yahoo.jp/J4_fuy",
  }),
  "RTX 5080": createAffiliateLinks({
    rakuten: "https://a.r10.to/hko5fa",
    amazon: "https://amzn.to/4dIIhIs",
    yahoo: "https://yahoo.jp/gUAiP8",
  }),
  "RTX 5090": createAffiliateLinks({
    rakuten: "https://a.r10.to/h8WZ1x",
    amazon: "https://amzn.to/4dtIlwP",
    yahoo: "https://yahoo.jp/t5UQrN",
  }),
  "RX 6600": createEmptyAffiliateLinks(),
  "RX 6700 XT": createEmptyAffiliateLinks(),
  "RX 6800 XT": createEmptyAffiliateLinks(),
  "RX 7600": createEmptyAffiliateLinks(),
  "RX 7700 XT": createAffiliateLinks({
    rakuten: "https://a.r10.to/hgs8If",
    amazon: "https://amzn.to/4dZhzfM",
    yahoo: "https://yahoo.jp/7hXLpZ",
  }),
  "RX 7800 XT": createAffiliateLinks({
    rakuten: "https://a.r10.to/hgEfCo",
    amazon: "https://amzn.to/4tQZZiM",
    yahoo: "https://yahoo.jp/sbnabe",
  }),
  "RX 7900 GRE": createAffiliateLinks({
    rakuten: "https://a.r10.to/h5wlC5",
    amazon: "https://amzn.to/4dskY6H",
    yahoo: "https://yahoo.jp/iDoC3K",
  }),
  "RX 7900 XT": createAffiliateLinks({
    rakuten: "https://a.r10.to/hPFmPH",
    amazon: "https://amzn.to/4eZvZxw",
    yahoo: "https://yahoo.jp/ixo_TF",
  }),
  "RX 7900 XTX": createAffiliateLinks({
    rakuten: "https://a.r10.to/hgs8tW",
    amazon: "https://amzn.to/4fECru3",
    yahoo: "https://yahoo.jp/mEWboU",
  }),
  "RX 9070": createAffiliateLinks({
    rakuten: "https://a.r10.to/hk2Oby",
    amazon: "https://amzn.to/49lJq7n",
    yahoo: "https://yahoo.jp/dmoCpX",
  }),
  "RX 9070 XT": createAffiliateLinks({
    rakuten: "https://a.r10.to/h5394b",
    amazon: "https://amzn.to/4wOgOxo",
    yahoo: "https://yahoo.jp/_EQXSy",
  }),
};

window.gpuAffiliateLinks = gpuAffiliateLinks;

function createAffiliateLinks(links = {}) {
  return {
    rakuten: "",
    amazon: "",
    yahoo: "",
    bto: "",
    monitor: "",
    ...links,
  };
}

function createEmptyAffiliateLinks() {
  return createAffiliateLinks();
}
