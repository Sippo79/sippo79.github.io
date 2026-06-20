// =====================================================================
//  PC Builds Hub — Supabase 設定（サンプル）
//  ---------------------------------------------------------------------
//  使い方：
//    1) このファイルを `supabase-config.js` という名前でコピーする。
//    2) Supabase プロジェクトの URL と anon (public) key を入れる。
//    3) 各HTMLで、api.js より「前」に Supabase SDK と本ファイルを読み込む。
//       （詳細は SETUP_SUPABASE.md を参照）
//
//  注意：
//    - anon key は公開鍵なのでフロントに置いても問題ない（RLSで保護する）。
//    - service_role key は絶対にフロントに置かないこと。
//    - 本物の supabase-config.js は公開リポジトリに入れたくない場合 .gitignore 推奨。
// =====================================================================

window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_PUBLIC_ANON_KEY",
};
