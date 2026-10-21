// Export report MINGGUAN per klien ke Excel, mengikuti susunan file Performance Tracker tim:
//   blok minggu → header kolom → per platform (baris konten, TOTAL, AVERAGE),
//   ringkasan per platform di kanan (Previous / Current / Total Change / Relative Change, dibanding minggu lalu),
//   dan tabel jumlah konten + Kuota + Remain di paling kanan.
// Report bulanan memakai angka Insights dan cukup dilihat di app (tanpa export).
// Semua angka dihitung dengan lib/contentMetrics.js (sama dengan halaman Report).

import {
  aggregate, periodRecap, periodPosts, periodLabel, periodRange, shiftPeriod, change, engagementOf, erOf, hasMetrics,
} from "@/lib/contentMetrics";

const BOLD = { fontWeight: "bold" };
const HEAD = { fontWeight: "bold", backgroundColor: "#232220", textColor: "#FFFFFF", alignVertical: "center", wrap: true };
const SUB = { fontWeight: "bold", backgroundColor: "#EEEDE8" };
const TITLE = { fontWeight: "bold", fontSize: 13 };

const num = (v, style) => (v == null ? null : { value: v, type: Number, format: "#,##0", ...style });
const pct = (v, style) => (v == null ? null : { value: v, type: Number, format: "0.00%", ...style });
const txt = (v, style) => (v == null || v === "" ? null : { value: String(v), ...style });

function dateCell(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: "dd/mm/yyyy" };
}

function linkCell(url) {
  if (!url) return null;
  if (url.length > 250 || !/^https?:\/\//i.test(url)) return txt(url);
  const safe = url.replace(/"/g, '""');
  return { value: `HYPERLINK("${safe}","${safe}")`, type: "Formula", textColor: "#3D6FA6" };
}

// Kanvas sel: set(baris, kolom, sel) lalu rows() untuk write-excel-file.
function sheetGrid() {
  const grid = [];
  return {
    set(r, c, cell) {
      if (cell == null) return;
      (grid[r] ||= [])[c] = cell;
    },
    rows() {
      let width = 1;
      for (let r = 0; r < grid.length; r++) width = Math.max(width, grid[r]?.length || 0); // grid bisa bolong, jangan pakai map
      return Array.from({ length: grid.length }, (_, r) => Array.from({ length: width }, (_, c) => grid[r]?.[c] ?? null));
    },
  };
}

const sheetName = (s) => s.replace(/[\[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Report";
const fileSafe = (s) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

const POST_COLS = [
  "No", "Date", "Topic", "Content Type", "Link", "Platform", "Likes/Reaction", "Comments", "Share", "Repost", "Saved",
  "Profile Visit/Klik", "Follow", "Impressions/Plays", "Reach", "ER rate/ Reach", "Engagement", "Boosted/not", "Summary",
];

export async function exportReport({ period, client, posts, platforms, followers, quotas }) {
  const kind = "weekly";
  const published = posts.filter((p) => p.status === "published" && p.date);
  const platformOrder = [...platforms].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const periods = [period];
  const [rangeStart, rangeEnd] = periodRange(kind, period);
  const inRange = published.filter((p) => p.date >= rangeStart && p.date <= rangeEnd);
  if (inRange.length === 0) throw new Error(`Belum ada konten tayang di ${periodLabel(kind, period)}.`);
  const usedPlatforms = platformOrder.filter((pf) => inRange.some((p) => p.platform === pf.id));

  const recapKeys = [shiftPeriod(kind, periods[0], -1), ...periods]; // + periode sebelumnya untuk "Previous"
  const recap = periodRecap(posts, followers, client.id, usedPlatforms.map((p) => p.id), kind, recapKeys);

  // ===================== Sheet 1: per postingan =====================
  const g = sheetGrid();
  const SUMMARY_COL = POST_COLS.length + 1; // satu kolom kosong setelah "Summary"
  const SUMMARY_W = 6; // judul + 4 kolom angka + jarak
  let r = 0;

  for (const key of periods) {
    const blockStart = r;
    g.set(r, 0, txt(`Minggu ${periodLabel(kind, key)}`, TITLE));
    r += 1;
    POST_COLS.forEach((h, c) => g.set(r, c, { value: h, ...HEAD }));
    r += 1;

    for (const pf of usedPlatforms) {
      const list = periodPosts(posts, kind, key, pf.id).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
      if (list.length === 0) continue;
      g.set(r, 0, txt(pf.name, SUB));
      for (let c = 1; c < POST_COLS.length; c++) g.set(r, c, { value: "", ...SUB });
      r += 1;
      list.forEach((p, i) => {
        const mx = p.metrics || {};
        const measured = hasMetrics(p);
        [
          num(i + 1), dateCell(p.date), txt(p.title), txt(p.format), linkCell(p.postLink), txt(pf.name),
          num(mx.likes), num(mx.comments), num(mx.shares), num(mx.reposts), num(mx.saves),
          num(mx.clicks), num(mx.follows), num(mx.impressions), num(mx.reach),
          measured ? pct(erOf(p)) : null, measured ? num(engagementOf(p)) : null,
          txt(p.boosted ? "boosted" : "organic"), txt(p.insight, { wrap: true }),
        ].forEach((cell, c) => g.set(r, c, cell));
        r += 1;
      });
      const agg = aggregate(list);
      const n = agg.measured || null;
      [
        txt("TOTAL", BOLD), null, null, null, null, null,
        num(agg.likes, BOLD), num(agg.comments, BOLD), num(agg.shares, BOLD), num(agg.reposts, BOLD), num(agg.saves, BOLD),
        num(agg.clicks, BOLD), num(agg.follows, BOLD), num(agg.impressions, BOLD), num(agg.reach, BOLD),
        pct(agg.er, BOLD), num(agg.engagement, BOLD),
      ].forEach((cell, c) => g.set(r, c, cell));
      r += 1;
      const avg = (v) => (n ? { value: v / n, type: Number, format: "#,##0.0" } : null);
      [
        txt("AVERAGE", BOLD), null, null, null, null, null,
        avg(agg.likes), avg(agg.comments), avg(agg.shares), avg(agg.reposts), avg(agg.saves),
        avg(agg.clicks), avg(agg.follows), avg(agg.impressions), avg(agg.reach), null, avg(agg.engagement),
      ].forEach((cell, c) => g.set(r, c, cell));
      r += 1;
    }

    // Ringkasan per platform di kanan blok ini (seperti "INSTAGRAM SUMMARY (Februari 2026)").
    usedPlatforms.forEach((pf, idx) => {
      const col = SUMMARY_COL + idx * SUMMARY_W;
      const rows = recap[pf.id];
      const at = recapKeys.indexOf(key);
      const cur = rows[at];
      const prev = rows[at - 1];
      let sr = blockStart;
      g.set(sr, col, txt(`${pf.name.toUpperCase()} SUMMARY (${periodLabel(kind, key)})`, BOLD));
      sr += 1;
      ["Previous", "Current", "Total Change", "Relative Change"].forEach((h, i) => g.set(sr, col + 1 + i, { value: h, ...HEAD }));
      sr += 1;
      const metric = (label, cv, pv, isPct) => {
        const ch = change(cv, pv);
        const f = isPct ? pct : num;
        g.set(sr, col, txt(label, BOLD));
        g.set(sr, col + 1, f(pv));
        g.set(sr, col + 2, f(cv));
        g.set(sr, col + 3, f(ch.abs));
        g.set(sr, col + 4, ch.rel == null ? null : { value: ch.rel, type: Number, format: "0.0%" });
        sr += 1;
      };
      const measured = (row) => (row && row.measured ? row : null);
      metric("Followers", cur.followers, prev?.followers ?? null, false);
      metric("Engagement", measured(cur)?.engagement ?? null, measured(prev)?.engagement ?? null, false);
      metric("ER", cur.er, prev?.er ?? null, true);
      metric("Impressions", measured(cur)?.impressions ?? null, measured(prev)?.impressions ?? null, false);
      metric("Reach", measured(cur)?.reach ?? null, measured(prev)?.reach ?? null, false);
      r = Math.max(r, sr);
    });

    r += 1; // baris kosong antar periode
  }

  // Tabel jumlah konten per periode + kuota (paling kanan, mulai baris atas).
  const qCol = SUMMARY_COL + usedPlatforms.length * SUMMARY_W;
  g.set(0, qCol, { value: "Week", ...HEAD });
  usedPlatforms.forEach((pf, i) => g.set(0, qCol + 1 + i, { value: pf.name, ...HEAD }));
  periods.forEach((key, pi) => {
    g.set(1 + pi, qCol, txt(periodLabel(kind, key)));
    usedPlatforms.forEach((pf, i) => g.set(1 + pi, qCol + 1 + i, num(periodPosts(posts, kind, key, pf.id).length)));
  });
  const qr = 1 + periods.length;
  g.set(qr, qCol, txt("Total", BOLD));
  g.set(qr + 1, qCol, txt("Kuota", BOLD));
  g.set(qr + 2, qCol, txt("Remain", BOLD));
  usedPlatforms.forEach((pf, i) => {
    g.set(qr, qCol + 1 + i, num(inRange.filter((p) => p.platform === pf.id).length, BOLD));
    const q = quotas.find((x) => x.client === client.id && x.platform === pf.id);
    if (!q) return;
    // Sisa kuota dihitung sampai akhir periode yang di-export.
    const used = published.filter((p) => p.platform === pf.id && p.date >= q.start && p.date <= q.end && p.date <= rangeEnd).length;
    g.set(qr + 1, qCol + 1 + i, num(q.quota));
    g.set(qr + 2, qCol + 1 + i, num(Math.max(0, q.quota - used)));
  });

  const postWidths = [5, 11, 38, 13, 30, 11, 10, 10, 8, 8, 8, 11, 8, 12, 10, 11, 11, 11, 34, 2];
  const summaryWidths = usedPlatforms.flatMap(() => [26, 11, 11, 12, 13, 2]);
  const quotaWidths = [12, ...usedPlatforms.map(() => 11)];
  const short = client.short || client.name;
  const sheets = [
    { sheet: sheetName(short), data: g.rows(), columns: [...postWidths, ...summaryWidths, ...quotaWidths].map((width) => ({ width })) },
  ];

  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const blob = await writeExcelFile(sheets).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileSafe(`${short}_Weekly Report_${periodLabel(kind, period)}`) + ".xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
