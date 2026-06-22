// =====================================================================
//  PC Builds Hub — Supabase 設定（実体ファイル）
//  ---------------------------------------------------------------------
//  ※ ここには本番 Supabase の「URL」と「anon key」を入れて使います。
//     この2つはフロントエンドに公開される前提の値であり、ブラウザに
//     配信されても問題ありません（保護は RLS で担保します）。
//     そのため supabase-config.js は GitHub Pages 配信のためにコミット
//     対象として扱います。
//
//  🚫 絶対に入れてはいけない値（フロント / 公開リポジトリに置かない）：
//     - service_role key
//     - secret key（sb_secret など）
//     - DB password / 接続文字列（postgres://…）
//     - JWT secret
//     ここに入れてよいのは「URL」と「anon (publishable) key」だけです。
//
//  値が未設定（YOUR_…）の間は、api.js が自動的に posts.json を使います。
//  詳しい手順は SETUP_SUPABASE.md を参照。
// =====================================================================

window.SUPABASE_CONFIG = {
  url: "https://ndckywicmdrmdtfeywdu.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kY2t5d2ljbWRybWR0ZmV5d2R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzkxOTcsImV4cCI6MjA5NzM1NTE5N30.zKL8zeyn7VGCW-xFVodVZgWZPEjr4VKKQVNSGz_A1PM",
};
