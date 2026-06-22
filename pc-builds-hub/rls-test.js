// =====================================================================
//  PC Builds Hub — RLS テストハーネス (rls-test.js)
//  ---------------------------------------------------------------------
//  目的：supabase-schema.sql の RLS / 列保護トリガーが正しく効いているかを、
//        実際に anon / 一般ユーザー / 管理者の 3 クライアントで Supabase を
//        叩いて検証する（= api.js を迂回した直接アクセスを再現）。
//
//  使い方：
//    1) supabase-config.js に本物の URL / anon key を設定する。
//    2) 事前に「一般ユーザー」「管理者」2 アカウントを作成・メール確認し、
//       管理者は profiles.role='admin' にしておく（SETUP_SUPABASE.md 参照）。
//    3) rls-test.html を開き、両アカウントの email/password を入力して実行。
//
//  注意：
//    - service_role は一切使わない（anon key + ログインのみ）。RLS の実挙動を見る。
//    - テスト用の投稿（タイトル接頭辞 [RLS-TEST]）を作成し、最後に削除する。
//    - 何度実行しても残骸が出ないよう、開始時にも掃除する。
// =====================================================================

(function (global) {
  "use strict";

  const TEST_PREFIX = "[RLS-TEST] ";
  const results = [];

  // --- 結果記録 -------------------------------------------------------
  function record(id, name, pass, detail) {
    results.push({ id: id, name: name, pass: pass, detail: detail || "" });
    const tag = pass === true ? "PASS" : pass === false ? "FAIL" : "INFO";
    const fn = pass === false ? console.error : console.info;
    fn.call(console, `[RLS-TEST][${tag}] ${id}. ${name}` + (detail ? ` — ${detail}` : ""));
  }

  // 1 件のテストを安全に実行（例外は FAIL として記録）
  async function check(id, name, fn) {
    try {
      const r = await fn();
      record(id, name, !!r.pass, r.detail);
    } catch (e) {
      record(id, name, false, "例外: " + ((e && e.message) || e));
    }
  }

  // --- クライアント生成（セッション非共有で role ごとに独立）-----------
  function makeClient() {
    const cfg = global.SUPABASE_CONFIG;
    return global.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  function isConfigured() {
    const cfg = global.SUPABASE_CONFIG;
    return !!(
      cfg &&
      cfg.url &&
      cfg.anonKey &&
      !/YOUR_|example|xxxx/i.test(String(cfg.url)) &&
      !/YOUR_|example|xxxx/i.test(String(cfg.anonKey)) &&
      global.supabase &&
      typeof global.supabase.createClient === "function"
    );
  }

  async function signIn(client, email, password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: email,
      password: password,
    });
    if (error) throw new Error("ログイン失敗(" + email + "): " + error.message);
    return data.user;
  }

  // 管理者クライアントで status を問わず 1 件読む（検証用の信頼できる読み出し）
  async function readAsAdmin(admin, id, cols) {
    const { data, error } = await admin
      .from("posts")
      .select(cols || "*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // 一般ユーザーで pending 投稿を 1 件作成
  async function insertPending(user, userId, title) {
    return user
      .from("posts")
      .insert({
        user_id: userId,
        title: TEST_PREFIX + title,
        status: "pending",
        nice_count: 0,
        badge: null,
        cpu: "CPU-A",
        gpu: "GPU-A",
        memory: "16GB",
        resolution: "FHD",
        usage: "ゲーム",
      })
      .select()
      .single();
  }

  // テスト投稿の一括削除（管理者は delete ポリシーで全テスト投稿を消せる）
  async function cleanup(admin) {
    try {
      await admin.from("posts").delete().like("title", TEST_PREFIX + "%");
    } catch (e) {
      console.warn("[RLS-TEST] クリーンアップ失敗（手動削除が必要かも）:", e);
    }
  }

  // =====================================================================
  //  メイン
  // =====================================================================
  async function runRlsTests(creds) {
    results.length = 0;
    console.info("[RLS-TEST] ===== 開始 =====");

    // --- 10. フォールバック（設定有無に関わらず確認できる）-------------
    await check("10", "Supabase未設定時は posts.json にフォールバックできる", async () => {
      const res = await fetch("posts.json", { cache: "no-store" });
      if (!res.ok) return { pass: false, detail: "posts.json 取得失敗: " + res.status };
      const json = await res.json();
      const ok = Array.isArray(json) && json.length > 0;
      const enabled =
        global.PCBuildsAPI &&
        typeof global.PCBuildsAPI.isSupabaseEnabled === "function" &&
        global.PCBuildsAPI.isSupabaseEnabled();
      return {
        pass: ok,
        detail:
          "posts.json=" + (json ? json.length : 0) + "件" +
          (enabled
            ? "（現在 Supabase 有効。ダミー値に戻して再読込すると実際にフォールバックします）"
            : "（現在 Supabase 無効＝フォールバック動作中）"),
      };
    });

    if (!isConfigured()) {
      record("1-8", "RLS テスト", null,
        "Supabase が未設定（ダミー値）のため 1〜8 はスキップ。supabase-config.js を設定してください。");
      return summarize();
    }
    if (!creds || !creds.userEmail || !creds.adminEmail) {
      record("1-8", "RLS テスト", null,
        "一般ユーザー / 管理者の認証情報が未入力のため 1〜8 はスキップ。");
      return summarize();
    }

    const anon = makeClient();
    const user = makeClient();
    const admin = makeClient();

    let userId, adminId;
    try {
      const u = await signIn(user, creds.userEmail, creds.userPassword);
      const a = await signIn(admin, creds.adminEmail, creds.adminPassword);
      userId = u.id;
      adminId = a.id;
    } catch (e) {
      record("auth", "テストアカウントのログイン", false, (e && e.message) || String(e));
      return summarize();
    }

    // 前提チェック：admin は admin / user は非 admin であること
    try {
      const { data: ap } = await admin.from("profiles").select("role").eq("id", adminId).single();
      const { data: up } = await user.from("profiles").select("role").eq("id", userId).single();
      record("pre", "前提：管理者アカウントが role=admin", (ap && ap.role) === "admin",
        "admin.role=" + (ap && ap.role) + " / user.role=" + (up && up.role));
      if ((up && up.role) === "admin") {
        record("pre2", "前提：一般ユーザーは非 admin", false,
          "一般ユーザーが admin になっています。別アカウントを使ってください。");
      }
    } catch (e) {
      record("pre", "前提チェック", false, (e && e.message) || String(e));
    }

    // 念のため過去の残骸を掃除してからフィクスチャ作成
    await cleanup(admin);

    // --- フィクスチャ作成：approved / rejected / pending を 1 件ずつ -----
    let pApp, pRej, pPend;
    try {
      const r1 = await insertPending(user, userId, "approved-fixture");
      const r2 = await insertPending(user, userId, "rejected-fixture");
      const r3 = await insertPending(user, userId, "pending-fixture");
      if (r1.error || r2.error || r3.error) {
        throw new Error(
          "pending 作成に失敗: " +
            [r1.error, r2.error, r3.error].filter(Boolean).map((e) => e.message).join(" / ")
        );
      }
      pApp = r1.data; pRej = r2.data; pPend = r3.data;

      // 3. authenticated は status='pending' の投稿だけ insert できる
      record("3", "一般ユーザーは status='pending' で投稿を作成できる",
        pPend && pPend.status === "pending",
        "作成された status=" + (pPend && pPend.status));

      // 管理者が approved / rejected へ（これ自体が後半テスト7の前提）
      const ua = await admin.from("posts").update({ status: "approved" }).eq("id", pApp.id).select().single();
      const ur = await admin.from("posts").update({ status: "rejected" }).eq("id", pRej.id).select().single();
      if (ua.error || ur.error) throw new Error("管理者の status 変更に失敗");
    } catch (e) {
      record("fixture", "フィクスチャ作成", false, (e && e.message) || String(e));
      await cleanup(admin);
      return summarize();
    }

    // --- 1. anon は approved 投稿を select できる ----------------------
    await check("1", "anon は approved 投稿を select できる", async () => {
      const { data, error } = await anon.from("posts").select("id,status").eq("id", pApp.id);
      if (error) return { pass: false, detail: "error: " + error.message };
      return {
        pass: data.length === 1 && data[0].status === "approved",
        detail: "取得 " + data.length + " 件",
      };
    });

    // --- 2. anon は pending / rejected を select できない ---------------
    await check("2", "anon は pending / rejected 投稿を select できない", async () => {
      const { data: dp } = await anon.from("posts").select("id").eq("id", pPend.id);
      const { data: dr } = await anon.from("posts").select("id").eq("id", pRej.id);
      const pass = (dp || []).length === 0 && (dr || []).length === 0;
      return { pass: pass, detail: "pending=" + (dp || []).length + "件 / rejected=" + (dr || []).length + "件（両方0が正解）" };
    });

    // --- 4. authenticated が status='approved' で insert すると失敗 -----
    await check("4", "一般ユーザーは status='approved' で insert できない", async () => {
      const { data, error } = await user
        .from("posts")
        .insert({
          user_id: userId,
          title: TEST_PREFIX + "evil-approved",
          status: "approved",
          cpu: "x", gpu: "y", memory: "z", resolution: "FHD", usage: "ゲーム",
        })
        .select();
      // 万一 insert できてしまったら掃除しつつ FAIL
      if (data && data.length) {
        await admin.from("posts").delete().eq("id", data[0].id);
        return { pass: false, detail: "approved で insert が通ってしまった（危険）" };
      }
      return { pass: !!error, detail: error ? "RLS が拒否: " + (error.code || error.message) : "拒否されず" };
    });

    // --- 5. 所有者が自分の投稿を approved に update しても approved にならない ---
    await check("5", "所有者は status を自己昇格(approved)できない", async () => {
      const before = await readAsAdmin(admin, pPend.id, "status");
      await user.from("posts").update({ status: "approved" }).eq("id", pPend.id); // 試行
      const after = await readAsAdmin(admin, pPend.id, "status");
      return {
        pass: after.status === before.status && after.status !== "approved",
        detail: "before=" + before.status + " → after=" + after.status + "（pending のままが正解）",
      };
    });

    // --- 6. 所有者は nice_count / badge / user_id / created_at を変更できない ---
    await check("6", "所有者は nice_count/badge/user_id/created_at を改変できない", async () => {
      const before = await readAsAdmin(admin, pPend.id, "nice_count,badge,user_id,created_at");
      await user.from("posts").update({ nice_count: 999, badge: "editor", created_at: "2000-01-01T00:00:00Z" }).eq("id", pPend.id);
      await user.from("posts").update({ user_id: adminId }).eq("id", pPend.id); // 所有者すり替えの試行
      const after = await readAsAdmin(admin, pPend.id, "nice_count,badge,user_id,created_at");
      const same =
        after.nice_count === before.nice_count &&
        after.badge === before.badge &&
        after.user_id === before.user_id &&
        after.created_at === before.created_at;
      return {
        pass: same,
        detail:
          "nice_count " + before.nice_count + "→" + after.nice_count +
          " / badge " + before.badge + "→" + after.badge +
          " / user_id一致=" + (after.user_id === before.user_id) +
          " / created_at一致=" + (after.created_at === before.created_at),
      };
    });

    // --- 7. 管理者だけが status を approved / rejected に変更できる ------
    await check("7", "管理者は status を approved/rejected に変更できる", async () => {
      const u1 = await admin.from("posts").update({ status: "approved" }).eq("id", pPend.id).select("status").single();
      const afterApprove = u1.data && u1.data.status;
      const u2 = await admin.from("posts").update({ status: "rejected" }).eq("id", pPend.id).select("status").single();
      const afterReject = u2.data && u2.data.status;
      // 後続テストのため pending に戻す
      await admin.from("posts").update({ status: "pending" }).eq("id", pPend.id);
      return {
        pass: afterApprove === "approved" && afterReject === "rejected",
        detail: "approve→" + afterApprove + " / reject→" + afterReject,
      };
    });

    // --- 8. Nice：likes 更新後に nice_count が増減する ------------------
    await check("8", "Nice で likes を増減すると nice_count が同期する", async () => {
      const before = await readAsAdmin(admin, pApp.id, "nice_count");
      const ins = await user.from("likes").insert({ post_id: pApp.id, user_id: userId });
      if (ins.error) return { pass: false, detail: "like insert 失敗: " + ins.error.message };
      const afterLike = await readAsAdmin(admin, pApp.id, "nice_count");
      await user.from("likes").delete().eq("post_id", pApp.id).eq("user_id", userId);
      const afterUnlike = await readAsAdmin(admin, pApp.id, "nice_count");
      return {
        pass: afterLike.nice_count === before.nice_count + 1 && afterUnlike.nice_count === before.nice_count,
        detail: before.nice_count + " →(+1)→ " + afterLike.nice_count + " →(-1)→ " + afterUnlike.nice_count,
      };
    });

    // --- 11. approved 投稿を所有者が編集すると再審査(pending)に戻る -----
    await check("11", "approved投稿を所有者が公開内容を編集すると pending に戻る", async () => {
      const ins = await insertPending(user, userId, "rereview-owner");
      if (ins.error) return { pass: false, detail: "作成失敗: " + ins.error.message };
      const id = ins.data.id;
      // 管理者が承認 → approved にしておく
      const appr = await admin.from("posts").update({ status: "approved" }).eq("id", id).select("status").single();
      if (!appr.data || appr.data.status !== "approved") {
        return { pass: false, detail: "承認準備に失敗: " + (appr.error && appr.error.message) };
      }
      // 所有者が公開内容（title/body/image_url/cpu/gpu）を編集
      const up = await user
        .from("posts")
        .update({
          title: TEST_PREFIX + "rereview-owner-edited",
          description: "本文(body)を編集しました",
          image_url: "https://example.com/owner-new.png",
          cpu: "CPU-EDITED",
          gpu: "GPU-EDITED",
        })
        .eq("id", id);
      if (up.error) return { pass: false, detail: "所有者編集が拒否された: " + up.error.message };
      const after = await readAsAdmin(admin, id, "status,title,cpu");
      return {
        pass: after.status === "pending",
        detail:
          "approved→所有者が公開内容を編集→status=" + after.status +
          "（pending が正解）/ title反映=" + (after.title.indexOf("owner-edited") >= 0) +
          " / cpu=" + after.cpu,
      };
    });

    // --- 12. 管理者の編集では status が意図せず pending に戻らない -------
    await check("12", "管理者が公開内容を編集しても status は approved のまま維持される", async () => {
      const ins = await insertPending(user, userId, "rereview-admin");
      if (ins.error) return { pass: false, detail: "作成失敗: " + ins.error.message };
      const id = ins.data.id;
      const appr = await admin.from("posts").update({ status: "approved" }).eq("id", id).select("status").single();
      if (!appr.data || appr.data.status !== "approved") {
        return { pass: false, detail: "承認準備に失敗: " + (appr.error && appr.error.message) };
      }
      // 管理者が公開内容を編集（status カラムには触れない）
      const up = await admin
        .from("posts")
        .update({
          title: TEST_PREFIX + "rereview-admin-edited",
          description: "管理者が本文(body)を編集しました",
          image_url: "https://example.com/admin-new.png",
          cpu: "CPU-ADMIN-EDITED",
          gpu: "GPU-ADMIN-EDITED",
        })
        .eq("id", id);
      if (up.error) return { pass: false, detail: "管理者編集が拒否された: " + up.error.message };
      const after = await readAsAdmin(admin, id, "status,title,cpu");
      return {
        pass: after.status === "approved",
        detail:
          "approved→管理者が公開内容を編集→status=" + after.status +
          "（approved 維持が正解）/ title反映=" + (after.title.indexOf("admin-edited") >= 0) +
          " / cpu=" + after.cpu,
      };
    });

    // --- 13. 一般ユーザーは自分の role を admin に昇格できない（C1）------
    await check("13", "一般ユーザーは profiles.role を admin に昇格できない", async () => {
      // 自分のプロフィールを admin 経由で読んで before スナップショット
      const before = await admin.from("profiles").select("role,id").eq("id", userId).single();
      if (before.error || !before.data) {
        return { pass: false, detail: "プロフィール取得失敗: " + (before.error && before.error.message) };
      }
      // 攻撃試行(1)：自分の role を admin に書き換え
      await user.from("profiles").update({ role: "admin" }).eq("id", userId);
      // 攻撃試行(2)：主キー id を別人(admin)の id にすり替え
      await user.from("profiles").update({ id: adminId }).eq("id", userId);

      // admin で読み戻して確認（id は元のまま見つかるはず）
      const after = await admin.from("profiles").select("role,id").eq("id", userId).single();
      const role = after.data && after.data.role;
      const idOk = after.data && after.data.id === before.data.id;
      return {
        pass: role !== "admin" && role === before.data.role && idOk,
        detail:
          "role " + before.data.role + "→" + role +
          "（admin 以外が正解）/ id 不変=" + idOk,
      };
    });

    // --- 後始末 ---------------------------------------------------------
    await cleanup(admin);
    await Promise.allSettled([anon.auth.signOut(), user.auth.signOut(), admin.auth.signOut()]);

    return summarize();
  }

  function summarize() {
    const pass = results.filter((r) => r.pass === true).length;
    const fail = results.filter((r) => r.pass === false).length;
    const info = results.filter((r) => r.pass === null).length;
    console.info(`[RLS-TEST] ===== 終了：PASS ${pass} / FAIL ${fail} / INFO ${info} =====`);
    if (typeof global.__renderRlsResults === "function") {
      global.__renderRlsResults(results, { pass, fail, info });
    }
    return { results: results.slice(), pass, fail, info };
  }

  global.runRlsTests = runRlsTests;
})(window);
