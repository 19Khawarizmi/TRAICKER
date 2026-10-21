import { supabase } from "@/lib/supabase";

// Baca/tulis ruang kerja Content plan. Hak akses dijaga RLS di database (lihat migrasi 20261021000000).
//
// post = { id, client, platform, format, title, date, time, pillar, brief, caption, hashtags, visualLink, postLink,
//          status, approval, approvalNote, specialist, designer, createdBy,
//          metrics (angka performa per konten, diisi saat report mingguan), boosted, insight }

export const STAGES = [
  { id: "brief", label: "Content Brief", color: "var(--s-todo)", dot: "" },
  { id: "production", label: "Produksi", color: "var(--s-progress)", dot: "is-half" },
  { id: "internal_review", label: "Review internal", color: "var(--s-review)", dot: "is-half" },
  { id: "revision", label: "Revisi", color: "var(--danger)", dot: "is-half" },
  { id: "scheduled", label: "Terjadwal", color: "var(--s-ongoing)", dot: "is-half" },
  { id: "published", label: "Tayang", color: "var(--s-done)", dot: "is-filled" },
];
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

export const APPROVALS = [
  { id: "none", label: "Belum dikirim", tone: "neutral" },
  { id: "waiting", label: "Menunggu klien", tone: "warn" },
  { id: "approved", label: "Disetujui klien", tone: "ok" },
  { id: "changes", label: "Klien minta revisi", tone: "danger" },
];
export const APPROVAL_BY_ID = Object.fromEntries(APPROVALS.map((a) => [a.id, a]));

const POST_COLUMNS =
  "id, client_id, platform_id, format, title, publish_date, publish_time, pillar, brief, caption, hashtags, visual_link, post_link, status, approval, approval_note, approval_at, specialist_id, designer_id, created_by, created_at, updated_at, " +
  "m_likes, m_comments, m_shares, m_reposts, m_saves, m_clicks, m_follows, m_impressions, m_reach, is_boosted, insight, metrics_updated_at";

const METRIC_KEYS = ["likes", "comments", "shares", "reposts", "saves", "clicks", "follows", "impressions", "reach"];

// Angka Insights bulanan: kunci di app → kolom di database.
const INSIGHT_COLUMNS = {
  followers: "followers", reach: "reach", engagement: "engagement", impressions: "impressions", profileVisits: "profile_visits",
  posts: "posts", linkClicks: "link_clicks", newFollows: "new_follows", unfollows: "unfollows",
};

function check({ data, error }) {
  if (error) throw error;
  return data;
}

function toPlatform(row) {
  return {
    id: row.id,
    name: row.name,
    short: row.short_name,
    color: row.color,
    formats: row.formats || [],
    charLimit: row.char_limit,
    sortOrder: row.sort_order,
    archived: !!row.archived_at,
  };
}

function toPost(row) {
  return {
    id: row.id,
    client: row.client_id,
    platform: row.platform_id,
    format: row.format || "",
    title: row.title,
    date: row.publish_date || "",
    time: row.publish_time ? row.publish_time.slice(0, 5) : "",
    pillar: row.pillar || "",
    brief: row.brief || "",
    caption: row.caption || "",
    hashtags: row.hashtags || "",
    visualLink: row.visual_link || "",
    postLink: row.post_link || "",
    status: row.status,
    approval: row.approval,
    approvalNote: row.approval_note || "",
    approvalAt: row.approval_at,
    specialist: row.specialist_id || null,
    designer: row.designer_id || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, row[`m_${k}`] ?? null])),
    boosted: !!row.is_boosted,
    insight: row.insight || "",
    metricsUpdatedAt: row.metrics_updated_at,
  };
}

function metricColumns(prefix, metrics) {
  return Object.fromEntries(METRIC_KEYS.map((k) => {
    const v = metrics?.[k];
    return [`${prefix}${k}`, v === "" || v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v)))];
  }));
}

function toRow(post) {
  const blank = (v) => (v && String(v).trim() ? String(v).trim() : null);
  return {
    client_id: post.client,
    platform_id: post.platform,
    format: blank(post.format),
    title: post.title.trim(),
    publish_date: post.date || null,
    publish_time: post.time || null,
    pillar: blank(post.pillar),
    brief: blank(post.brief),
    caption: post.caption || null,
    hashtags: blank(post.hashtags),
    visual_link: blank(post.visualLink),
    post_link: blank(post.postLink),
    status: post.status,
    approval: post.approval,
    approval_note: blank(post.approvalNote),
    specialist_id: post.specialist || null,
    designer_id: post.designer || null,
    ...metricColumns("m_", post.metrics),
    is_boosted: !!post.boosted,
    insight: blank(post.insight),
  };
}

// Update yang ditolak RLS tidak menghasilkan error, hanya 0 baris. Anggap itu "tidak punya akses".
async function updateOne(table, id, values) {
  const rows = check(await supabase.from(table).update(values).eq("id", id).select("id"));
  if (rows.length === 0) throw new Error("Kamu tidak punya akses untuk mengubah data ini.");
}

export async function fetchContentBoard() {
  const [platforms, posts, followers, targets, quotas, insights] = await Promise.all([
    supabase.from("content_platforms").select("id, name, short_name, color, formats, char_limit, sort_order, archived_at").order("sort_order"),
    supabase.from("content_posts").select(POST_COLUMNS).order("publish_date", { ascending: true, nullsFirst: false }).order("publish_time"),
    supabase.from("content_followers").select("client_id, platform_id, recorded_on, followers"),
    supabase.from("content_targets").select("client_id, metric, horizon_months, target"),
    supabase.from("content_quotas").select("client_id, platform_id, quota, start_date, end_date"),
    supabase.from("content_insights").select(`client_id, platform_id, month, ${Object.values(INSIGHT_COLUMNS).join(", ")}`),
  ]);
  return {
    platforms: check(platforms).map(toPlatform),
    posts: check(posts).map(toPost),
    followers: check(followers).map((r) => ({ client: r.client_id, platform: r.platform_id, date: r.recorded_on, followers: r.followers })),
    targets: check(targets).map((r) => ({ client: r.client_id, metric: r.metric, months: r.horizon_months, target: Number(r.target) })),
    quotas: check(quotas).map((r) => ({ client: r.client_id, platform: r.platform_id, quota: r.quota, start: r.start_date, end: r.end_date })),
    insights: check(insights).map((r) => ({
      client: r.client_id,
      platform: r.platform_id,
      month: r.month.slice(0, 7),
      ...Object.fromEntries(Object.entries(INSIGHT_COLUMNS).map(([k, col]) => [k, r[col]])),
    })),
  };
}

export async function savePost(post, isNew) {
  const values = toRow(post);
  // Catat kapan approval berubah, supaya terlihat "disetujui tanggal berapa".
  if (post.approvalChanged) values.approval_at = post.approval === "none" ? null : new Date().toISOString();
  if (post.metricsChanged) values.metrics_updated_at = new Date().toISOString();
  if (isNew) {
    // created_by diisi otomatis oleh database (auth.uid()).
    check(await supabase.from("content_posts").insert({ id: post.id, ...values }));
  } else {
    await updateOne("content_posts", post.id, values);
  }
}

export async function updatePostFields(id, fields) {
  const map = { status: "status", date: "publish_date", time: "publish_time" };
  const values = {};
  for (const [k, v] of Object.entries(fields)) values[map[k] || k] = v || null;
  await updateOne("content_posts", id, values);
}

export async function deletePost(id) {
  const rows = check(await supabase.from("content_posts").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new Error("Kamu tidak punya akses untuk menghapus konten ini.");
}

// ---- Platform (khusus admin; dijaga RLS) ----

export async function createPlatform(p) {
  check(
    await supabase.from("content_platforms").insert({
      id: p.id,
      name: p.name,
      short_name: p.short,
      color: p.color,
      formats: p.formats,
      char_limit: p.charLimit || null,
      sort_order: p.sortOrder,
    })
  );
}

export async function updatePlatform(id, p) {
  await updateOne("content_platforms", id, {
    name: p.name,
    short_name: p.short,
    color: p.color,
    formats: p.formats,
    char_limit: p.charLimit || null,
  });
}

export async function setPlatformArchived(id, archived) {
  await updateOne("content_platforms", id, { archived_at: archived ? new Date().toISOString() : null });
}

export async function deletePlatform(id) {
  const { data, error } = await supabase.from("content_platforms").delete().eq("id", id).select("id");
  if (error?.code === "23503") throw new Error("Platform ini masih dipakai konten. Arsipkan saja, atau pindahkan kontennya dulu.");
  if (error) throw error;
  if (data.length === 0) throw new Error("Kamu tidak punya akses untuk menghapus platform ini.");
}

// ---- Report: followers per tanggal (mingguan), Insights bulanan, target KPI, kuota ----

// date = 'YYYY-MM-DD' (biasanya akhir periode). Kosong = hapus catatan itu (hanya admin, dijaga RLS).
export async function saveFollowers(client, platform, date, followers, userId) {
  const key = { client_id: client, platform_id: platform, recorded_on: date };
  if (followers === null) {
    check(await supabase.from("content_followers").delete().match(key));
    return;
  }
  check(await supabase.from("content_followers").upsert({ ...key, followers, updated_by: userId }));
}

// targets: [{ metric, months, target|null }] — null berarti hapus target itu.
export async function saveTargets(client, targets) {
  const keep = targets.filter((t) => t.target != null);
  const drop = targets.filter((t) => t.target == null);
  if (keep.length) {
    check(await supabase.from("content_targets").upsert(keep.map((t) => ({ client_id: client, metric: t.metric, horizon_months: t.months, target: t.target }))));
  }
  for (const t of drop) {
    check(await supabase.from("content_targets").delete().match({ client_id: client, metric: t.metric, horizon_months: t.months }));
  }
}

// quota null = hapus kuota platform itu.
export async function saveQuota(client, platform, quota) {
  if (!quota) {
    check(await supabase.from("content_quotas").delete().match({ client_id: client, platform_id: platform }));
    return;
  }
  check(await supabase.from("content_quotas").upsert({ client_id: client, platform_id: platform, quota: quota.quota, start_date: quota.start, end_date: quota.end }));
}

// month = 'YYYY-MM'; values = { followers, reach, ... } (null = kosong).
export async function saveInsights(client, platform, month, values, userId) {
  const row = { client_id: client, platform_id: platform, month: `${month}-01`, updated_by: userId };
  for (const [k, col] of Object.entries(INSIGHT_COLUMNS)) {
    const v = values[k];
    row[col] = v == null || v === "" || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v)));
  }
  check(await supabase.from("content_insights").upsert(row));
}
