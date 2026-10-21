// Rumus report performa organik — satu sumber untuk halaman Report dan export Excel.
//
//   Engagement   = likes + komentar + share + repost + saved      (sama untuk semua platform)
//   Aksi         = klik / profile visit + follow                   (dicatat terpisah)
//   ER postingan = engagement / reach
//   ER periode   = total engagement / total reach                  (bukan rata-rata ER per postingan)
//   ER followers = total engagement / followers akhir periode      (pembanding untuk target KPI)
//
// Dua jenis report:
//   Mingguan  : konten tayang Senin–Minggu, dari angka per konten (diisi saat report Senin).
//               Followers minggu = catatan followers terakhir di dalam minggu itu.
//   Bulanan   : angka akun langsung dari Insights platform untuk tanggal 1–akhir bulan (INSIGHT_FIELDS).
//               ER/Reach bulanan = engagement ÷ reach dari Insights.

export const METRIC_FIELDS = [
  { key: "likes", label: "Likes / Reaction", short: "Likes" },
  { key: "comments", label: "Komentar", short: "Komentar" },
  { key: "shares", label: "Share", short: "Share" },
  { key: "reposts", label: "Repost", short: "Repost" },
  { key: "saves", label: "Saved", short: "Saved" },
  { key: "clicks", label: "Klik / Profile visit", short: "Klik" },
  { key: "follows", label: "Follow", short: "Follow" },
  { key: "impressions", label: "Impressions / Plays", short: "Impressions" },
  { key: "reach", label: "Reach", short: "Reach" },
];

const ENGAGEMENT_KEYS = ["likes", "comments", "shares", "reposts", "saves"];
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export const hasValues = (metrics) => METRIC_FIELDS.some((f) => metrics?.[f.key] != null);

export function hasMetrics(post) {
  return hasValues(post.metrics);
}

export function engagementOf(post) {
  return ENGAGEMENT_KEYS.reduce((sum, k) => sum + n(post.metrics?.[k]), 0);
}

export function actionsOf(post) {
  return n(post.metrics?.clicks) + n(post.metrics?.follows);
}

export function erOf(post) {
  const reach = post.metrics?.reach;
  return reach ? engagementOf(post) / reach : null;
}

// Angka akun bulanan dari Insights (per klien, per platform, per bulan).
export const INSIGHT_FIELDS = [
  { key: "followers", label: "Followers" },
  { key: "reach", label: "Reach" },
  { key: "engagement", label: "Engagement" },
  { key: "impressions", label: "Impression / Views" },
  { key: "profileVisits", label: "Profile visits" },
  { key: "posts", label: "Jumlah post" },
  { key: "linkClicks", label: "Link clicks / website" },
  { key: "newFollows", label: "Followers baru" },
  { key: "unfollows", label: "Unfollow" },
];

export function insightOf(insights, clientId, platformId, month) {
  return insights.find((x) => x.client === clientId && x.platform === platformId && x.month === month) || null;
}

export function insightEr(row) {
  return row?.reach && row.engagement != null ? row.engagement / row.reach : null;
}

// ---- Tanggal & periode ----

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const toDate = (s) => new Date(s + "T00:00:00");

export function monthKey(s) {
  return s ? s.slice(0, 7) : "";
}

export function addMonths(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key, style = "long") {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: style, year: "numeric" });
}

// Kunci minggu = tanggal Senin-nya (YYYY-MM-DD).
export function weekKey(s) {
  const d = toDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

export function periodOf(kind, s) {
  return kind === "weekly" ? weekKey(s) : monthKey(s);
}

export function periodRange(kind, key) {
  if (kind === "weekly") {
    const end = toDate(key);
    end.setDate(end.getDate() + 6);
    return [key, ymd(end)];
  }
  const [y, m] = key.split("-").map(Number);
  return [`${key}-01`, ymd(new Date(y, m, 0))];
}

export function shiftPeriod(kind, key, delta) {
  if (kind === "weekly") {
    const d = toDate(key);
    d.setDate(d.getDate() + delta * 7);
    return ymd(d);
  }
  return addMonths(key, delta);
}

// style "long": "13–19 Okt 2026" / "Oktober 2026"; "short": "13 Okt" / "Okt 2026"; "axis": "13/10" / "Okt".
export function periodLabel(kind, key, style = "long") {
  if (!key) return "";
  if (kind !== "weekly") {
    if (style === "axis") return monthLabel(key, "short").split(" ")[0];
    return monthLabel(key, style === "short" ? "short" : "long");
  }
  const [start, end] = periodRange("weekly", key).map(toDate);
  if (style === "axis") return `${start.getDate()}/${start.getMonth() + 1}`;
  if (style === "short") return start.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  const left = start.toLocaleDateString("id-ID", sameMonth ? { day: "numeric" } : sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  return `${left}–${end.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;
}

export const inPeriod = (kind, key, s) => {
  if (!s) return false;
  const [start, end] = periodRange(kind, key);
  return s >= start && s <= end;
};

// Followers: [{ client, platform, date: 'YYYY-MM-DD', followers }] → catatan terakhir di dalam periode.
export function followersAt(followers, clientId, platformId, kind, key) {
  const [start, end] = periodRange(kind, key);
  let best = null;
  for (const f of followers) {
    if (f.client !== clientId || f.platform !== platformId || f.date < start || f.date > end) continue;
    if (!best || f.date > best.date) best = f;
  }
  return best;
}

// ---- Rekap ----

// Ringkasan sekumpulan postingan (hanya yang sudah punya metrik).
export function aggregate(posts) {
  const withData = posts.filter(hasMetrics);
  const sum = Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, withData.reduce((s, p) => s + n(p.metrics[f.key]), 0)]));
  const engagement = withData.reduce((s, p) => s + engagementOf(p), 0);
  const actions = withData.reduce((s, p) => s + actionsOf(p), 0);
  return {
    posts: posts.length,
    measured: withData.length,
    ...sum,
    engagement,
    actions,
    er: sum.reach > 0 ? engagement / sum.reach : null,
    avgReach: withData.length ? sum.reach / withData.length : null,
    avgEngagement: withData.length ? engagement / withData.length : null,
  };
}

export function change(current, previous) {
  if (current == null || previous == null) return { abs: null, rel: null };
  return { abs: current - previous, rel: previous !== 0 ? (current - previous) / previous : null };
}

// Konten tayang satu klien di satu periode.
export function periodPosts(posts, kind, key, platformId) {
  return posts.filter((p) => p.status === "published" && (!platformId || p.platform === platformId) && inPeriod(kind, key, p.date));
}

// Rekap per platform untuk beberapa periode: { [platformId]: [{ key, ...aggregate, followers, erFollowers }] }
export function periodRecap(posts, followers, clientId, platformIds, kind, keys) {
  const result = {};
  for (const pid of platformIds) {
    result[pid] = keys.map((key) => {
      const agg = aggregate(periodPosts(posts, kind, key, pid));
      const f = followersAt(followers, clientId, pid, kind, key)?.followers ?? null;
      return { key, ...agg, followers: f, erFollowers: f ? agg.engagement / f : null };
    });
  }
  return result;
}

export function fmtInt(v) {
  return v == null ? "—" : Math.round(v).toLocaleString("id-ID");
}

export function fmtPct(v, digits = 1) {
  return v == null ? "—" : `${(v * 100).toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function fmtDelta(rel) {
  if (rel == null) return "—";
  const sign = rel > 0 ? "+" : "";
  return `${sign}${(rel * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}
