(function (global) {
  "use strict";

  const POSTS_JSON_PATH = "posts.json";
  const FALLBACK_IMAGE = "images/no-image.svg";
  const APPROVED_LIMIT = 200;
  const MAX_IMAGES = 5;
  const MAX_TAGS = 10;

  const DEBUG = (function () {
    try {
      const h = global.location && global.location.hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "" ||
        (global.location && global.location.protocol === "file:");
    } catch (_) {
      return false;
    }
  })();

  function pcbLog() {
    if (!DEBUG) return;
    console.info.apply(console, ["[api]"].concat(Array.prototype.slice.call(arguments)));
  }

  function logSbError(label, error) {
    if (!error) return;
    console.error("[api] " + label, { code: error.code, message: error.message });
  }

  function getSupabaseClient() {
    if (global.__pcbSupabaseClient) return global.__pcbSupabaseClient;
    const cfg = global.SUPABASE_CONFIG;
    const sdk = global.supabase;
    const url = cfg && cfg.url ? String(cfg.url).trim() : "";
    const anonKey = cfg && cfg.anonKey ? String(cfg.anonKey).trim() : "";
    const placeholder = !url || !anonKey || /YOUR_|example|xxxx/i.test(url) || /YOUR_|example|xxxx/i.test(anonKey);
    if (!placeholder && sdk && typeof sdk.createClient === "function") {
      global.__pcbSupabaseClient = sdk.createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        global: { headers: { apikey: anonKey } },
      });
      return global.__pcbSupabaseClient;
    }
    return null;
  }

  function isSupabaseEnabled() {
    return getSupabaseClient() !== null;
  }

  function safeImageUrl(value) {
    const s = (value == null ? "" : String(value)).trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^(javascript|data|vbscript):/i.test(s) || /^\/\//.test(s) || /[\s<>"']/.test(s)) return null;
    return /^[./]?[A-Za-z0-9_./%~?&=+#-]+$/.test(s) ? s : null;
  }

  function splitImageValues(values) {
    if (Array.isArray(values)) return values;
    if (values == null || String(values).trim() === "") return [];
    return String(values).split(/\r?\n|,/);
  }

  function normalizePostImages(row) {
    row = row || {};
    let list = [];
    if (Array.isArray(row.image_urls)) list = row.image_urls;
    else if (typeof row.image_urls === "string" && row.image_urls.trim()) {
      try {
        const parsed = JSON.parse(row.image_urls);
        list = Array.isArray(parsed) ? parsed : splitImageValues(row.image_urls);
      } catch (_) {
        list = splitImageValues(row.image_urls);
      }
    } else if (Array.isArray(row.images)) list = row.images;
    else if (typeof row.images === "string" && row.images.trim()) {
      try {
        const parsed = JSON.parse(row.images);
        list = Array.isArray(parsed) ? parsed : splitImageValues(row.images);
      } catch (_) {
        list = splitImageValues(row.images);
      }
    }
    if (!list.length && row.image_url) list = [row.image_url];
    if (!list.length && row.image) list = [row.image];
    return Array.from(new Set(list.map((v) => String(v || "").trim()).filter(Boolean))).slice(0, MAX_IMAGES);
  }

  function mapRowToPost(row) {
    row = row || {};
    const imgs = normalizePostImages(row);
    return {
      id: row.id,
      title: row.title || "無題のPC構成",
      user: row.display_name || row.user || "匿名ユーザー",
      cpu: row.cpu,
      gpu: row.gpu,
      ram: row.memory ?? row.ram,
      resolution: row.resolution,
      usage: row.usage,
      image: imgs[0] || FALLBACK_IMAGE,
      images: imgs,
      image_urls: imgs,
      motherboard: row.motherboard,
      storage: row.storage,
      case: row.case_name ?? row.case,
      psu: row.psu,
      cooler: row.cooler,
      budget: row.budget,
      benchTitle: row.bench_title ?? row.benchTitle ?? "",
      benchScore: row.bench_score ?? row.benchScore ?? "",
      comment: row.description ?? row.comment,
      tags: Array.isArray(row.tags) ? row.tags : [],
      badge: row.badge || "",
      niceCount: row.nice_count ?? 0,
      status: row.status,
      created_at: row.created_at,
    };
  }

  async function fetchFromJson() {
    const res = await fetch(POSTS_JSON_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("posts.json load failed: " + res.status);
    return res.json();
  }

  async function fetchDisplayNames(client, userIds) {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!ids.length) return {};
    try {
      const { data, error } = await client.from("profiles").select("id, display_name").in("id", ids);
      if (error) throw error;
      const map = {};
      (data || []).forEach((r) => { map[r.id] = r.display_name; });
      return map;
    } catch (e) {
      logSbError("fetchDisplayNames failed", e);
      return {};
    }
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
  }

  async function getApprovedPosts() {
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from("posts")
          .select("*")
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(APPROVED_LIMIT);
        if (error) throw error;
        const names = await fetchDisplayNames(client, (data || []).map((r) => r.user_id));
        return (data || []).map((r) => mapRowToPost({ ...r, display_name: names[r.user_id] }));
      } catch (e) {
        logSbError("getApprovedPosts failed; fallback to posts.json", e);
        return fetchFromJson();
      }
    }
    return fetchFromJson();
  }

  function pickWeightedPost(posts) {
    const list = Array.isArray(posts) ? posts.filter(Boolean) : [];
    if (!list.length) return null;
    const withImage = list.filter((post) => normalizePostImages(post).length > 0 || String(post.image_url || "").trim());
    const pool = withImage.length ? withImage : list;
    const total = pool.reduce((sum, post) => sum + Math.max(1, Number(post.nice_count || 0) + 1), 0);
    let cursor = Math.random() * total;
    for (const post of pool) {
      cursor -= Math.max(1, Number(post.nice_count || 0) + 1);
      if (cursor <= 0) return post;
    }
    return pool[pool.length - 1];
  }

  async function getShowcasePost() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
      const { data, error } = await client
        .from("posts")
        .select("*")
        .eq("status", "approved")
        .order("nice_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const picked = pickWeightedPost(data || []);
      if (!picked) return null;
      const names = await fetchDisplayNames(client, [picked.user_id]);
      return mapRowToPost({ ...picked, display_name: names[picked.user_id] });
    } catch (e) {
      logSbError("getShowcasePost failed", e);
      return null;
    }
  }

  async function getPostById(id) {
    const target = String(id);
    const client = getSupabaseClient();
    if (client && isUuid(target)) {
      try {
        const { data, error } = await client
          .from("posts")
          .select("*")
          .eq("status", "approved")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const names = await fetchDisplayNames(client, [data.user_id]);
          return mapRowToPost({ ...data, display_name: names[data.user_id] });
        }
      } catch (e) {
        logSbError("getPostById failed; fallback to posts.json", e);
      }
    }
    const json = await fetchFromJson();
    return (json || []).find((p, i) => String(p.id ?? p.slug ?? p.title ?? i) === target) || null;
  }

  async function getMyLikedPostIds(postIds) {
    const client = getSupabaseClient();
    const ids = (postIds || []).map((s) => String(s || "")).filter(isUuid);
    if (!client || !ids.length) return new Set();
    try {
      const { data: userData } = await client.auth.getUser();
      const user = userData && userData.user;
      if (!user) return new Set();
      const { data, error } = await client.from("likes").select("post_id").eq("user_id", user.id).in("post_id", ids);
      if (error) throw error;
      return new Set((data || []).map((r) => String(r.post_id)));
    } catch (_) {
      return new Set();
    }
  }

  async function hasLiked(postId) {
    const set = await getMyLikedPostIds([postId]);
    return set.has(String(postId));
  }

  async function getLikeCount(postId) {
    const client = getSupabaseClient();
    if (!client || !isUuid(String(postId))) return 0;
    try {
      const { data, error } = await client.from("posts").select("nice_count").eq("id", postId).maybeSingle();
      if (error || !data) return 0;
      return Number(data.nice_count || 0);
    } catch (_) {
      return 0;
    }
  }

  async function toggleLike(postId) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    if (!isUuid(String(postId))) throw new Error("INVALID_POST");
    const { data: userData } = await client.auth.getUser();
    const user = userData && userData.user;
    if (!user) throw new Error("NOT_LOGGED_IN");

    const { data: existing, error: selErr } = await client
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (selErr) throw selErr;

    let liked;
    if (existing) {
      const { error } = await client.from("likes").delete().eq("post_id", postId).eq("user_id", user.id);
      if (error) throw error;
      liked = false;
    } else {
      const { error } = await client.from("likes").insert({ post_id: postId, user_id: user.id });
      if (error && error.code !== "23505") throw error;
      liked = true;
    }
    return { liked: liked, count: await getLikeCount(postId) };
  }

  function normalizePostInput(input) {
    input = input || {};
    const str = (v) => {
      const s = (v == null ? "" : String(v)).trim();
      return s === "" ? null : s;
    };
    const num = (v) => {
      const s = (v == null ? "" : String(v)).replace(/[^\d.-]/g, "");
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    let tags = [];
    if (Array.isArray(input.tags)) tags = input.tags.slice();
    else if (input.tags != null && String(input.tags).trim() !== "") tags = String(input.tags).split(/[\s,、，]+/);
    tags = Array.from(new Set(tags.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean))).slice(0, MAX_TAGS);

    let images = [];
    images = images.concat(splitImageValues(input.images));
    images = images.concat(splitImageValues(input.image_urls));
    images = images.concat(splitImageValues(input.image_url));
    images = Array.from(new Set(images.map(safeImageUrl).filter(Boolean))).slice(0, MAX_IMAGES);

    return {
      images: images,
      title: str(input.title),
      description: str(input.description),
      cpu: str(input.cpu),
      gpu: str(input.gpu),
      motherboard: str(input.motherboard),
      memory: str(input.memory),
      storage: str(input.storage),
      psu: str(input.psu),
      case_name: str(input.case_name),
      cooler: str(input.cooler),
      budget: num(input.budget),
      resolution: str(input.resolution),
      usage: str(input.usage),
      tags: tags,
      image_url: images[0] || safeImageUrl(input.image_url),
      bench_title: str(input.bench_title),
      bench_score: num(input.bench_score),
    };
  }

  async function uploadPostImage(file, userId) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    if (!file) throw new Error("NO_FILE");
    const dotIdx = file.name.lastIndexOf(".");
    const ext = (dotIdx >= 0 ? file.name.slice(dotIdx + 1) : "").toLowerCase();
    const safeExt = /^(jpg|jpeg|png|webp)$/.test(ext) ? ext : "bin";
    const path = String(userId) + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + safeExt;
    const { error } = await client.storage.from("post-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data } = client.storage.from("post-images").getPublicUrl(path);
    return data && data.publicUrl ? data.publicUrl : null;
  }

  async function uploadPostImages(files, userId) {
    const list = Array.prototype.slice.call(files || []).slice(0, MAX_IMAGES);
    const urls = [];
    for (let i = 0; i < list.length; i++) {
      const url = await uploadPostImage(list[i], userId);
      if (url) urls.push(url);
    }
    return urls;
  }

  function isMissingImageUrlsColumn(error) {
    const msg = (error && (error.message || error.details || error.hint)) || "";
    return !!error && (error.code === "PGRST204" || /image_urls|schema cache|Could not find the .* column/i.test(msg));
  }

  async function createPost(input) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    const { data: userData } = await client.auth.getUser();
    const user = userData && userData.user;
    if (!user) throw new Error("NOT_LOGGED_IN");
    const n = normalizePostInput(input);
    const imageUrls = n.images && n.images.length ? n.images : (n.image_url ? [n.image_url] : []);
    const payload = {
      user_id: user.id,
      title: n.title,
      description: n.description,
      cpu: n.cpu,
      gpu: n.gpu,
      motherboard: n.motherboard,
      memory: n.memory,
      storage: n.storage,
      psu: n.psu,
      case_name: n.case_name,
      cooler: n.cooler,
      budget: n.budget,
      resolution: n.resolution,
      usage: n.usage,
      tags: n.tags,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      bench_title: n.bench_title,
      bench_score: n.bench_score,
      badge: null,
      status: "pending",
      nice_count: 0,
    };
    let { data, error } = await client.from("posts").insert(payload).select().single();
    if (error && isMissingImageUrlsColumn(error)) {
      const fallbackPayload = Object.assign({}, payload);
      delete fallbackPayload.image_urls;
      const retry = await client.from("posts").insert(fallbackPayload).select().single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    return data;
  }

  async function getMyPosts() {
    const client = getSupabaseClient();
    if (!client) return [];
    const { data: userData } = await client.auth.getUser();
    const user = userData && userData.user;
    if (!user) return [];
    const { data, error } = await client.from("posts").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r) => mapRowToPost(r));
  }

  async function getMyPostById(postId) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    const { data: userData } = await client.auth.getUser();
    const user = userData && userData.user;
    if (!user) throw new Error("NOT_LOGGED_IN");
    const { data, error } = await client.from("posts").select("*").eq("id", postId).eq("user_id", user.id).maybeSingle();
    if (error) { logSbError("getMyPostById failed", error); throw error; }
    return data || null;
  }

  async function updateMyPost(postId, input) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    const { data: userData } = await client.auth.getUser();
    const user = userData && userData.user;
    if (!user) throw new Error("NOT_LOGGED_IN");
    const n = normalizePostInput(input);
    const imageUrls = n.images && n.images.length ? n.images : (n.image_url ? [n.image_url] : []);
    const payload = {
      title: n.title,
      description: n.description,
      cpu: n.cpu,
      gpu: n.gpu,
      motherboard: n.motherboard,
      memory: n.memory,
      storage: n.storage,
      psu: n.psu,
      case_name: n.case_name,
      cooler: n.cooler,
      budget: n.budget,
      resolution: n.resolution,
      usage: n.usage,
      tags: n.tags,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      bench_title: n.bench_title,
      bench_score: n.bench_score,
      status: "pending",
    };
    let { data, error } = await client.from("posts").update(payload).eq("id", postId).eq("user_id", user.id).select().maybeSingle();
    if (error && isMissingImageUrlsColumn(error)) {
      const fallbackPayload = Object.assign({}, payload);
      delete fallbackPayload.image_urls;
      const retry = await client.from("posts").update(fallbackPayload).eq("id", postId).eq("user_id", user.id).select().maybeSingle();
      data = retry.data;
      error = retry.error;
    }
    if (error) { logSbError("updateMyPost failed", error); throw error; }
    if (!data) throw new Error("NOT_OWNER_OR_NOT_FOUND");
    return data;
  }

  async function deleteMyPost(postId) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    const { data: userData } = await client.auth.getUser();
    const user = userData && userData.user;
    if (!user) throw new Error("NOT_LOGGED_IN");
    const { error } = await client.from("posts").delete().eq("id", postId).eq("user_id", user.id);
    if (error) { logSbError("deleteMyPost failed", error); throw error; }
    return true;
  }

  async function isAdmin() {
    const client = getSupabaseClient();
    if (!client) return false;
    try {
      const { data: userData } = await client.auth.getUser();
      const user = userData && userData.user;
      if (!user) return false;
      const { data, error } = await client.from("profiles").select("role").eq("id", user.id).single();
      if (error) throw error;
      return !!data && data.role === "admin";
    } catch (e) {
      pcbLog("isAdmin failed", e);
      return false;
    }
  }

  async function getAdminPostsByStatus(status) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    const { data, error } = await client.from("posts").select("*").eq("status", status).order("created_at", { ascending: false });
    if (error) { logSbError("getAdminPostsByStatus failed", error); throw error; }
    const names = await fetchDisplayNames(client, (data || []).map((r) => r.user_id));
    return (data || []).map((r) => mapRowToPost({ ...r, display_name: names[r.user_id] }));
  }

  async function getPendingPosts() {
    return getAdminPostsByStatus("pending");
  }

  async function updatePostStatus(postId, status) {
    const client = getSupabaseClient();
    if (!client) throw new Error("AUTH_UNAVAILABLE");
    if (["approved", "rejected"].indexOf(status) === -1) throw new Error("INVALID_STATUS");
    const { data, error } = await client.from("posts").update({ status: status }).eq("id", postId).select().single();
    if (error) throw error;
    return data;
  }

  global.PCBuildsAPI = {
    isSupabaseEnabled,
    getSupabaseClient,
    getApprovedPosts,
    getShowcasePost,
    getPostById,
    getMyLikedPostIds,
    hasLiked,
    getLikeCount,
    toggleLike,
    MAX_IMAGES,
    normalizePostInput,
    uploadPostImage,
    uploadPostImages,
    createPost,
    getMyPosts,
    getMyPostById,
    updateMyPost,
    deleteMyPost,
    isAdmin,
    getPendingPosts,
    getAdminPostsByStatus,
    updatePostStatus,
    loadPosts: getApprovedPosts,
  };
})(window);
