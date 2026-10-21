"use client";

import React, { useMemo, useState } from "react";
import Icon from "@/components/icons";
import * as cdb from "@/lib/contentData";
import { exportReport } from "@/lib/exportReport";
import {
  aggregate, periodRecap, periodPosts, periodRange, periodLabel, shiftPeriod, followersAt, monthKey, weekKey, addMonths,
  change, engagementOf, erOf, hasMetrics, INSIGHT_FIELDS, insightOf, insightEr, fmtInt, fmtPct, fmtDelta,
} from "@/lib/contentMetrics";

// Report performa per klien:
//   Mingguan : konten tayang Senin–Minggu, dari angka per konten.
//   Bulanan  : overview akun dari angka Insights (tanggal 1–akhir bulan), diisi manual.
// Rumus: lib/contentMetrics.js.

const TARGET_METRICS = [
  { id: "followers_growth", label: "Followers growth", unit: "%" },
  { id: "engagement_rate", label: "Engagement rate", unit: "%" },
  { id: "reach", label: "Reach", unit: "" },
  { id: "website_visits", label: "Website visits / bulan", unit: "" },
  { id: "inbound_leads", label: "Inbound leads", unit: "" },
];

function Delta({ rel, invert }) {
  if (rel == null) return <span className="rp-delta">—</span>;
  const up = rel > 0;
  const tone = rel === 0 ? "" : (up !== !!invert ? "is-up" : "is-down");
  return <span className={`rp-delta ${tone}`}>{up ? "▲" : rel < 0 ? "▼" : ""} {fmtDelta(rel)}</span>;
}

// ---- Grafik kecil (SVG, satu sumbu, legenda + tooltip lewat <title>) ----

function TrendChart({ title, series, axisLabels, longLabels, format, kind }) {
  const W = 520, H = 170, L = 44, R = 10, T = 14, B = 26;
  const count = axisLabels.length;
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const max = all.length ? Math.max(...all) : 0;
  const top = max > 0 ? max * 1.15 : 1;
  const x0 = (i) => L + (i + 0.5) * ((W - L - R) / count);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const ticks = [0, top / 2, top];
  const groupW = ((W - L - R) / count) * 0.62;
  const barW = Math.max(4, groupW / Math.max(1, series.length) - 2);

  return (
    <figure className="rp-chart">
      <figcaption>
        <span className="rp-chart-title">{title}</span>
        {series.length > 1 && (
          <span className="rp-legend">
            {series.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.name}</span>)}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, ${count} periode terakhir`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="rp-grid" />
            <text x={L - 6} y={y(t) + 3} className="rp-axis" textAnchor="end">{format(t, true)}</text>
          </g>
        ))}
        {axisLabels.map((label, i) => (
          <text key={i} x={x0(i)} y={H - 8} className="rp-axis" textAnchor="middle">{label}</text>
        ))}
        {kind === "bar" &&
          series.map((s, si) =>
            s.values.map((v, i) => {
              if (v == null) return null;
              const x = x0(i) - groupW / 2 + si * (barW + 2);
              const h = Math.max(1, H - B - y(v));
              return (
                <rect key={`${s.id}-${i}`} x={x} y={H - B - h} width={barW} height={h} rx={3} fill={s.color} className="rp-col">
                  <title>{`${s.name} · ${longLabels[i]}: ${format(v)}`}</title>
                </rect>
              );
            })
          )}
        {kind === "line" &&
          series.map((s) => {
            const pts = s.values.map((v, i) => (v == null ? null : [x0(i), y(v)]));
            const d = pts.reduce((acc, p, i) => (p ? acc + `${acc && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]} ` : acc), "");
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) => p && (
                  <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={s.color} className="rp-dot">
                    <title>{`${s.name} · ${longLabels[i]}: ${format(s.values[i])}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
      </svg>
    </figure>
  );
}

// ---- Halaman Report ----

const KINDS = [
  { id: "weekly", label: "Mingguan", unit: "minggu", span: 8 },
  { id: "monthly", label: "Bulanan", unit: "bulan", span: 6 },
];

function defaultPeriod(kind, todayStr) {
  const today = todayStr || new Date().toISOString().slice(0, 10);
  // Report mingguan disusun hari Senin untuk minggu sebelumnya; report bulanan setelah bulannya selesai.
  return kind === "weekly" ? shiftPeriod("weekly", weekKey(today), -1) : addMonths(monthKey(today), -1);
}

const fmtShortDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const fmtRange = (kind, key) => {
  const [start, end] = periodRange(kind, key);
  return `${fmtShortDate(start)} – ${new Date(end + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`;
};
// Isian angka boleh pakai titik ribuan ("8.495" → 8495); kosong → null.
const parseCount = (raw) => {
  const digits = String(raw).replace(/\D/g, "");
  return digits === "" ? null : Number(digits);
};
const axisNum = (v, axis) => (axis ? (v >= 1000 ? `${Math.round(v / 1000)}rb` : Math.round(v)) : fmtInt(v));

export default function ReportView({
  posts, platforms, clients, activeClients, activeClient, followers, targets, quotas, insights,
  isAdmin, currentUserId, clientOf, profileOf, todayStr, onOpen, save, setFollowers, setTargets, setQuotas, setInsights,
}) {
  const [pickedClient, setPickedClient] = useState(null);
  const [kind, setKind] = useState(() => {
    try {
      return localStorage.getItem("traicker:report-kind") === "monthly" ? "monthly" : "weekly";
    } catch {
      return "weekly";
    }
  });
  const [periods, setPeriods] = useState(() => ({ weekly: defaultPeriod("weekly", todayStr), monthly: defaultPeriod("monthly", todayStr) }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const K = KINDS.find((k) => k.id === kind);
  const period = periods[kind];
  const setPeriod = (key) => setPeriods((prev) => ({ ...prev, [kind]: key }));
  function changeKind(next) {
    setKind(next);
    try {
      localStorage.setItem("traicker:report-kind", next);
    } catch {}
  }

  // Report selalu per klien. Saat sidebar "Semua klien", pilih klien di sini.
  const clientsWithPosts = activeClients.filter((c) => posts.some((p) => p.client === c.id));
  const clientId = activeClient !== "all" ? activeClient : pickedClient || clientsWithPosts[0]?.id || activeClients[0]?.id;
  const client = clientOf(clientId);
  const clientPosts = useMemo(() => posts.filter((p) => p.client === clientId), [posts, clientId]);
  const usedPlatformIds = platforms.filter((pf) => clientPosts.some((p) => p.platform === pf.id) || !pf.archived).map((p) => p.id);
  const keys = Array.from({ length: K.span }, (_, i) => shiftPeriod(kind, period, i - K.span + 1));
  const platformOf = (id) => platforms.find((p) => p.id === id);
  const [periodStart, periodEnd] = periodRange(kind, period);
  const isCurrent = todayStr && todayStr >= periodStart && todayStr <= periodEnd;

  // Konten tayang di periode ini (angka per konten) — untuk report mingguan dan "konten terbaik".
  const curPosts = periodPosts(clientPosts, kind, period);
  const missing = curPosts.filter((p) => !hasMetrics(p));
  const ranked = curPosts.filter((p) => p.metrics?.reach > 0).sort((a, b) => erOf(b) - erOf(a));
  const top = ranked.slice(0, 3);
  const bottom = ranked.slice(Math.max(3, ranked.length - 3)).reverse(); // tidak tumpang tindih dengan "terbaik"
  const byFormat = Object.entries(
    curPosts.reduce((acc, p) => {
      const k = `${p.platform}|${p.format || "Lainnya"}`;
      (acc[k] ||= []).push(p);
      return acc;
    }, {})
  ).map(([k, list]) => ({ platform: k.split("|")[0], format: k.split("|")[1], ...aggregate(list) }))
    .sort((a, b) => (b.er ?? -1) - (a.er ?? -1));

  // ---- Mingguan: followers dicatat di tanggal akhir minggu (Minggu) ----
  function updateFollowers(pid, raw) {
    const value = parseCount(raw);
    const existing = followersAt(followers, clientId, pid, "weekly", period);
    if ((existing?.followers ?? null) === value) return;
    if (value === null) {
      if (!isAdmin || !existing) return; // hapus catatan hanya admin
      setFollowers((prev) => prev.filter((f) => !(f.client === clientId && f.platform === pid && f.date === existing.date)));
      save(() => cdb.saveFollowers(clientId, pid, existing.date, null, currentUserId));
      return;
    }
    setFollowers((prev) => [
      ...prev.filter((f) => !(f.client === clientId && f.platform === pid && f.date === periodEnd)),
      { client: clientId, platform: pid, date: periodEnd, followers: value },
    ]);
    save(() => cdb.saveFollowers(clientId, pid, periodEnd, value, currentUserId));
  }

  // ---- Bulanan: angka akun dari Insights ----
  function updateInsight(pid, key, raw) {
    const value = parseCount(raw);
    const existing = insightOf(insights, clientId, pid, period);
    if ((existing?.[key] ?? null) === value) return;
    const next = { ...(existing || { client: clientId, platform: pid, month: period }), [key]: value };
    setInsights((prev) => [...prev.filter((x) => !(x.client === clientId && x.platform === pid && x.month === period)), next]);
    save(() => cdb.saveInsights(clientId, pid, period, next, currentUserId));
  }

  async function runExport() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportReport({ period, client, posts: clientPosts, platforms, followers, quotas });
    } catch (e) {
      window.alert(e.message || "Export gagal");
    }
    setExporting(false);
  }

  // ---- KPI (dari Insights bulanan) & kuota ----
  const clientTargets = targets.filter((t) => t.client === clientId);
  const insightSum = (months, key) => {
    let total = null;
    for (const m of months) for (const pid of usedPlatformIds) {
      const v = insightOf(insights, clientId, pid, m)?.[key];
      if (v != null) total = (total || 0) + v;
    }
    return total;
  };
  const kpiActual = (metric, horizon) => {
    const span = Array.from({ length: horizon }, (_, i) => addMonths(period, i - horizon + 1));
    if (metric === "followers_growth") {
      const now = insightSum([period], "followers");
      const before = insightSum([addMonths(period, -horizon)], "followers");
      return now != null && before ? (now - before) / before : null;
    }
    if (metric === "engagement_rate") {
      const reach = insightSum(span, "reach");
      const eng = insightSum(span, "engagement");
      return reach && eng != null ? eng / reach : null;
    }
    if (metric === "reach") return insightSum(span, "reach");
    if (metric === "website_visits") {
      const clicks = insightSum(span, "linkClicks");
      return clicks == null ? null : clicks / horizon;
    }
    return null;
  };

  const quotaRows = quotas.filter((q) => q.client === clientId).map((q) => {
    const done = clientPosts.filter((p) => p.platform === q.platform && p.status === "published" && p.date >= q.start && p.date <= q.end).length;
    return { ...q, done, remain: Math.max(0, q.quota - done) };
  });

  if (!clientId) {
    return <div className="cp-empty"><h3>Belum ada klien</h3><p>Tambahkan klien dulu lewat Kelola klien.</p></div>;
  }

  return (
    <div className="report">
      <div className="rp-bar">
        <div className="rp-bar-left">
          <div className="segmented rp-kind" role="tablist" aria-label="Jenis report">
            {KINDS.map((k) => (
              <button key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? "is-active" : ""} onClick={() => changeKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          {activeClient === "all" && (
            <select className="select" value={clientId} onChange={(e) => setPickedClient(e.target.value)} aria-label="Klien untuk report">
              {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="rp-month">
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setPeriod(shiftPeriod(kind, period, -1))} aria-label={`${K.unit} sebelumnya`}><Icon name="chevronLeft" size={14} /></button>
            <span className="serif rp-month-label">{periodLabel(kind, period)}</span>
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setPeriod(shiftPeriod(kind, period, 1))} aria-label={`${K.unit} berikutnya`}><Icon name="chevronRight" size={14} /></button>
          </div>
        </div>
        <div className="rp-bar-right">
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={() => setSettingsOpen(true)}>
              <Icon name="flag" size={13} />
              Target &amp; kuota
            </button>
          )}
          {kind === "weekly" && (
            <button className="btn btn-primary btn-sm" onClick={runExport} disabled={exporting || curPosts.length === 0}>
              {exporting ? <span className="spinner" style={{ borderTopColor: "var(--on-ink)" }} /> : <Icon name="download" size={13} />}
              Export mingguan
            </button>
          )}
        </div>
      </div>

      <p className="rp-note">
        {kind === "weekly"
          ? <>Konten tayang Senin–Minggu, dari angka per konten. Engagement = likes + komentar + share + repost + saved. ER = total engagement ÷ total reach.</>
          : <>Angka akun dari Insights untuk {fmtRange("monthly", period)}. Salin angkanya ke kotak di bawah; perubahan dibanding bulan lalu dan ER/Reach (engagement ÷ reach) dihitung otomatis.</>}
        {isCurrent && <> {kind === "weekly" ? "Minggu" : "Bulan"} ini masih berjalan.</>}
      </p>

      {kind === "weekly" && missing.length > 0 && (
        <div className="notice" style={{ margin: "0 0 12px" }}>
          <Icon name="alert" size={14} />
          <span>
            {missing.length} konten tayang belum diisi angkanya:{" "}
            {missing.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 && ", "}
                <button className="rp-link" onClick={() => onOpen(p)}>{p.title}</button>
              </React.Fragment>
            ))}
          </span>
        </div>
      )}

      {kind === "weekly"
        ? usedPlatformIds.map((pid) => (
            <WeeklyPlatform
              key={pid}
              pf={platformOf(pid)}
              rows={periodRecap(clientPosts, followers, clientId, [pid], "weekly", keys)[pid]}
              keys={keys}
              record={followersAt(followers, clientId, pid, "weekly", period)}
              periodEnd={periodEnd}
              period={period}
              onFollowers={(raw) => updateFollowers(pid, raw)}
            />
          ))
        : usedPlatformIds.map((pid) => (
            <MonthlyOverview
              key={pid}
              pf={platformOf(pid)}
              period={period}
              keys={keys}
              rows={keys.map((m) => insightOf(insights, clientId, pid, m))}
              postedInPlan={periodPosts(clientPosts, "monthly", period, pid).length}
              onChange={(key, raw) => updateInsight(pid, key, raw)}
            />
          ))}

      <section className="rp-grid2">
        <div className="rp-card">
          <h3 className="rp-card-title">Konten terbaik {kind === "weekly" ? "minggu" : "bulan"} ini</h3>
          {top.length === 0 ? <p className="text-muted">Belum ada konten tayang dengan angka di periode ini.</p> : top.map((p) => <RankRow key={p.id} post={p} platform={platformOf(p.platform)} onOpen={onOpen} />)}
          {bottom.length > 0 && (
            <>
              <h3 className="rp-card-title" style={{ marginTop: 16 }}>Paling rendah</h3>
              {bottom.map((p) => <RankRow key={p.id} post={p} platform={platformOf(p.platform)} onOpen={onOpen} />)}
            </>
          )}
        </div>
        <div className="rp-card">
          <h3 className="rp-card-title">Per format konten</h3>
          {byFormat.length === 0 ? <p className="text-muted">Belum ada data.</p> : (
            <table className="rp-mini">
              <thead><tr><th>Format</th><th>Konten</th><th>Rata-rata reach</th><th>ER</th></tr></thead>
              <tbody>
                {byFormat.map((r) => (
                  <tr key={`${r.platform}-${r.format}`}>
                    <th scope="row"><span className="pf-badge is-mini" style={{ "--pf": platformOf(r.platform)?.color }}>{platformOf(r.platform)?.short}</span> {r.format}</th>
                    <td className="mono">{r.posts}</td>
                    <td className="mono">{fmtInt(r.avgReach)}</td>
                    <td className="mono">{fmtPct(r.er, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {kind === "monthly" && <p className="text-muted" style={{ margin: "8px 0 0" }}>Dari angka per konten yang diisi saat report mingguan.</p>}
        </div>
      </section>

      <section className="rp-grid2">
        <div className="rp-card">
          <h3 className="rp-card-title">Kuota konten</h3>
          {quotaRows.length === 0 ? (
            <p className="text-muted">Belum ada kuota kontrak.{isAdmin ? " Atur lewat tombol Target & kuota." : ""}</p>
          ) : (
            quotaRows.map((q) => {
              const pf = platformOf(q.platform);
              const pct = Math.min(1, q.done / q.quota);
              return (
                <div key={q.platform} className="rp-quota">
                  <div className="rp-quota-head">
                    <span className="pf-badge is-mini" style={{ "--pf": pf?.color }}>{pf?.short}</span>
                    <span>{pf?.name}</span>
                    <span className="mono" style={{ marginLeft: "auto" }}>{q.done} / {q.quota}</span>
                  </div>
                  <div className="progress-track" style={{ height: 6 }}><div className="progress-fill" style={{ width: `${pct * 100}%`, background: pf?.color }} /></div>
                  <div className="text-muted">Sisa {q.remain} konten · periode {fmtShortDate(q.start)} – {new Date(q.end + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
              );
            })
          )}
        </div>

        <div className="rp-card">
          <h3 className="rp-card-title">Target KPI</h3>
          {kind === "weekly" ? (
            <p className="text-muted">Target KPI dihitung dari Insights per 3 dan 6 bulan. Lihat di report <button className="rp-link" onClick={() => changeKind("monthly")}>Bulanan</button>.</p>
          ) : clientTargets.length === 0 ? (
            <p className="text-muted">Belum ada target.{isAdmin ? " Atur lewat tombol Target & kuota." : ""}</p>
          ) : (
            <table className="rp-mini">
              <thead><tr><th>Metrik</th><th>3 bulan</th><th>6 bulan</th></tr></thead>
              <tbody>
                {TARGET_METRICS.filter((m) => clientTargets.some((t) => t.metric === m.id)).map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{m.label}</th>
                    {[3, 6].map((h) => {
                      const t = clientTargets.find((x) => x.metric === m.id && x.months === h);
                      const actual = kpiActual(m.id, h);
                      const fmt = (v) => (m.unit === "%" ? fmtPct(v, 2) : fmtInt(v));
                      const hit = t && actual != null && actual >= (m.unit === "%" ? t.target / 100 : t.target);
                      return (
                        <td key={h}>
                          {t ? <span className="mono">{m.unit === "%" ? `${t.target}%` : fmtInt(t.target)}</span> : <span className="text-muted">—</span>}
                          {t && (m.id === "inbound_leads"
                            ? <span className="rp-actual text-muted">diukur di luar Traicker</span>
                            : <span className={`rp-actual ${actual == null ? "text-muted" : hit ? "is-hit" : "is-miss"}`}>{actual == null ? "belum ada data" : `capai ${fmt(actual)}`}</span>)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {kind === "monthly" && clientTargets.length > 0 && (
            <p className="text-muted" style={{ margin: "8px 0 0" }}>Dihitung dari angka Insights semua platform. Website visits memakai rata-rata link clicks per bulan.</p>
          )}
        </div>
      </section>

      {settingsOpen && (
        <ReportSettings
          client={client}
          platforms={platforms}
          targets={clientTargets}
          quotas={quotas.filter((q) => q.client === clientId)}
          onClose={() => setSettingsOpen(false)}
          onSave={(nextTargets, nextQuotas) => {
            setTargets((prev) => [...prev.filter((t) => t.client !== clientId), ...nextTargets.filter((t) => t.target != null).map((t) => ({ ...t, client: clientId }))]);
            setQuotas((prev) => [...prev.filter((q) => q.client !== clientId), ...nextQuotas.filter((q) => q.quota).map((q) => ({ client: clientId, platform: q.platform, quota: q.quota, start: q.start, end: q.end }))]);
            save(async () => {
              await cdb.saveTargets(clientId, nextTargets);
              for (const q of nextQuotas) await cdb.saveQuota(clientId, q.platform, q.quota ? q : null);
            });
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---- Mingguan: satu platform (dari angka per konten) ----

function WeeklyPlatform({ pf, rows, keys, record, periodEnd, period, onFollowers }) {
  const cur = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  return (
    <section className="rp-platform">
      <header className="rp-platform-head">
        <span className="pf-badge" style={{ "--pf": pf.color }}>{pf.short}</span>
        <h3>{pf.name}</h3>
        <span className="text-muted">{cur.posts} konten tayang · {cur.measured} dengan angka</span>
      </header>

      <div className="rp-tiles">
        <div className="rp-tile">
          <label className="rp-tile-label" htmlFor={`fol-${pf.id}`}>Followers akhir minggu</label>
          <input
            id={`fol-${pf.id}`}
            key={`${pf.id}-${period}-${cur.followers}`}
            className="rp-tile-input mono"
            inputMode="numeric"
            defaultValue={cur.followers == null ? "" : fmtInt(cur.followers)}
            placeholder="Isi angka"
            onBlur={(e) => onFollowers(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
          {record && record.date !== periodEnd
            ? <span className="rp-delta">dicatat {fmtShortDate(record.date)}</span>
            : <Delta rel={change(cur.followers, prev.followers).rel} />}
        </div>
        {[
          ["Engagement", cur.engagement, prev.engagement],
          ["Reach", cur.reach, prev.reach],
          ["Impressions", cur.impressions, prev.impressions],
        ].map(([label, v, p]) => (
          <div key={label} className="rp-tile">
            <span className="rp-tile-label">{label}</span>
            <span className="rp-tile-value mono">{cur.measured ? fmtInt(v) : "—"}</span>
            <Delta rel={cur.measured && prev.measured ? change(v, p).rel : null} />
          </div>
        ))}
        <div className="rp-tile">
          <span className="rp-tile-label">ER (reach)</span>
          <span className="rp-tile-value mono">{fmtPct(cur.er, 2)}</span>
          <PointDelta cur={cur.er} prev={prev.er} />
        </div>
        <div className="rp-tile">
          <span className="rp-tile-label">Klik / profile visit</span>
          <span className="rp-tile-value mono">{cur.measured ? fmtInt(cur.clicks) : "—"}</span>
          <Delta rel={cur.measured && prev.measured ? change(cur.clicks, prev.clicks).rel : null} />
        </div>
      </div>

      <div className="rp-charts">
        <TrendChart
          title="Reach per minggu"
          kind="bar"
          axisLabels={keys.map((k) => periodLabel("weekly", k, "axis"))}
          longLabels={keys.map((k) => periodLabel("weekly", k))}
          series={[{ id: pf.id, name: pf.name, color: pf.color, values: rows.map((r) => (r.measured ? r.reach : null)) }]}
          format={axisNum}
        />
        <TrendChart
          title="ER per minggu"
          kind="line"
          axisLabels={keys.map((k) => periodLabel("weekly", k, "axis"))}
          longLabels={keys.map((k) => periodLabel("weekly", k))}
          series={[{ id: pf.id, name: pf.name, color: pf.color, values: rows.map((r) => r.er) }]}
          format={(v) => fmtPct(v, 1)}
        />
      </div>

      <RecapTable
        title="Rekap mingguan"
        heads={keys.map((k) => periodLabel("weekly", k, "short"))}
        rows={[
          ["Followers", rows.map((r) => r.followers), fmtInt],
          ["Konten tayang", rows.map((r) => r.posts), fmtInt],
          ["Engagement", rows.map((r) => (r.measured ? r.engagement : null)), fmtInt],
          ["Impressions", rows.map((r) => (r.measured ? r.impressions : null)), fmtInt],
          ["Reach", rows.map((r) => (r.measured ? r.reach : null)), fmtInt],
          ["ER (reach)", rows.map((r) => r.er), (v) => fmtPct(v, 2)],
          ["Klik / profile visit", rows.map((r) => (r.measured ? r.clicks : null)), fmtInt],
          ["Follow dari konten", rows.map((r) => (r.measured ? r.follows : null)), fmtInt],
        ]}
      />
    </section>
  );
}

// ---- Bulanan: overview satu platform (angka akun dari Insights) ----

function MonthlyOverview({ pf, period, keys, rows, postedInPlan, onChange }) {
  const cur = rows[rows.length - 1] || {};
  const prev = rows[rows.length - 2] || {};
  const er = insightEr(cur);
  const prevEr = insightEr(prev);
  const net = cur.newFollows != null && cur.unfollows != null ? cur.newFollows - cur.unfollows : null;

  return (
    <section className="rp-platform">
      <header className="rp-platform-head">
        <span className="pf-badge" style={{ "--pf": pf.color }}>{pf.short}</span>
        <h3>{pf.name} overview</h3>
        <span className="text-muted">Data Insights {fmtRange("monthly", period)}</span>
      </header>

      <div className="rp-tiles">
        {INSIGHT_FIELDS.map((f) => (
          <div key={f.key} className="rp-tile">
            <label className="rp-tile-label" htmlFor={`ins-${pf.id}-${f.key}`}>{f.label}</label>
            <input
              id={`ins-${pf.id}-${f.key}`}
              key={`${pf.id}-${period}-${f.key}-${cur[f.key] ?? ""}`}
              className="rp-tile-input mono"
              inputMode="numeric"
              defaultValue={cur[f.key] == null ? "" : fmtInt(cur[f.key])}
              placeholder={f.key === "posts" && postedInPlan ? `${postedInPlan} di plan` : "Isi angka"}
              onBlur={(e) => onChange(f.key, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <FromDelta cur={cur[f.key]} prev={prev[f.key]} invert={f.key === "unfollows"} />
          </div>
        ))}
        <div className="rp-tile is-computed">
          <span className="rp-tile-label">ER / Reach</span>
          <span className="rp-tile-value mono">{fmtPct(er, 1)}</span>
          {prevEr != null && er != null
            ? <span className="rp-delta">{er >= prevEr ? "▲" : "▼"} {((er - prevEr) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })} poin <span className="rp-from">dari {fmtPct(prevEr, 1)}</span></span>
            : <span className="rp-delta">engagement ÷ reach</span>}
        </div>
        <div className="rp-tile is-computed">
          <span className="rp-tile-label">Net followers</span>
          <span className="rp-tile-value mono">{net == null ? "—" : `${net > 0 ? "+" : ""}${fmtInt(net)}`}</span>
          <span className="rp-delta">followers baru − unfollow</span>
        </div>
      </div>

      <div className="rp-charts">
        <TrendChart
          title="Reach per bulan"
          kind="bar"
          axisLabels={keys.map((k) => periodLabel("monthly", k, "axis"))}
          longLabels={keys.map((k) => periodLabel("monthly", k))}
          series={[{ id: pf.id, name: pf.name, color: pf.color, values: rows.map((r) => r?.reach ?? null) }]}
          format={axisNum}
        />
        <TrendChart
          title="ER / Reach per bulan"
          kind="line"
          axisLabels={keys.map((k) => periodLabel("monthly", k, "axis"))}
          longLabels={keys.map((k) => periodLabel("monthly", k))}
          series={[{ id: pf.id, name: pf.name, color: pf.color, values: rows.map((r) => insightEr(r)) }]}
          format={(v) => fmtPct(v, 1)}
        />
      </div>

      <RecapTable
        title="Rekap bulanan"
        heads={keys.map((k) => periodLabel("monthly", k, "short"))}
        rows={[
          ...INSIGHT_FIELDS.map((f) => [f.label, rows.map((r) => r?.[f.key] ?? null), fmtInt, f.key === "unfollows"]),
          ["ER / Reach", rows.map((r) => insightEr(r)), (v) => fmtPct(v, 2)],
        ]}
      />
    </section>
  );
}

function FromDelta({ cur, prev, invert }) {
  const rel = change(cur ?? null, prev ?? null).rel;
  if (cur == null) return <span className="rp-delta">—</span>;
  if (prev == null) return <span className="rp-delta">bulan lalu belum diisi</span>;
  return (
    <span className="rp-delta-row">
      <Delta rel={rel} invert={invert} />
      <span className="rp-from">dari {fmtInt(prev)}</span>
    </span>
  );
}

function PointDelta({ cur, prev }) {
  if (cur == null || prev == null) return <span className="rp-delta">—</span>;
  return <span className="rp-delta">{cur >= prev ? "▲" : "▼"} {((cur - prev) * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })} poin</span>;
}

function RecapTable({ title, heads, rows }) {
  return (
    <div className="rp-table-scroll">
      <table className="rp-table">
        <thead>
          <tr>
            <th>{title}</th>
            {heads.map((h, i) => <th key={i} colSpan={2}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, values, f, invert]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {values.map((v, i) => (
                <React.Fragment key={i}>
                  <td className="mono">{f(v)}</td>
                  <td className="rp-pct"><Delta rel={i > 0 ? change(v, values[i - 1]).rel : null} invert={invert} /></td>
                </React.Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankRow({ post: p, platform, onOpen }) {
  return (
    <button className="rp-rank" onClick={() => onOpen(p)}>
      <span className="pf-badge is-mini" style={{ "--pf": platform?.color }}>{platform?.short}</span>
      <span className="rp-rank-title">{p.title}<span className="text-muted"> · {p.format || "—"}</span></span>
      <span className="mono rp-rank-num">{fmtPct(erOf(p), 1)}</span>
      <span className="mono text-muted rp-rank-sub">{fmtInt(p.metrics.reach)} reach · {fmtInt(engagementOf(p))} eng.</span>
    </button>
  );
}

// ---- Atur target KPI & kuota (admin) ----

function ReportSettings({ client, platforms, targets, quotas, onClose, onSave }) {
  const [t, setT] = useState(() =>
    Object.fromEntries(TARGET_METRICS.flatMap((m) => [3, 6].map((h) => [`${m.id}|${h}`, targets.find((x) => x.metric === m.id && x.months === h)?.target ?? ""])))
  );
  const active = platforms.filter((p) => !p.archived || quotas.some((q) => q.platform === p.id));
  const [q, setQ] = useState(() =>
    Object.fromEntries(active.map((p) => {
      const x = quotas.find((y) => y.platform === p.id);
      return [p.id, { quota: x?.quota ?? "", start: x?.start ?? "", end: x?.end ?? "" }];
    }))
  );
  const invalidQuota = Object.values(q).some((x) => x.quota && (!x.start || !x.end || x.start > x.end));

  function submit() {
    const nextTargets = TARGET_METRICS.flatMap((m) => [3, 6].map((h) => {
      const raw = String(t[`${m.id}|${h}`]).replace(",", ".").trim();
      return { metric: m.id, months: h, target: raw === "" || Number.isNaN(Number(raw)) ? null : Number(raw) };
    }));
    const nextQuotas = active.map((p) => ({ platform: p.id, quota: parseInt(q[p.id].quota, 10) || null, start: q[p.id].start, end: q[p.id].end }));
    onSave(nextTargets, nextQuotas);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog-wrap">
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="rs-title" style={{ maxWidth: 560 }}>
          <div className="dialog-head">
            <div style={{ flex: 1 }}>
              <h2 id="rs-title" className="dialog-title">Target &amp; kuota</h2>
              <p className="dialog-sub">{client.name}. Kosongkan isian untuk menghapus target atau kuota.</p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Tutup"><Icon name="x" /></button>
          </div>
          <div className="dialog-body">
            <div className="list-label" style={{ marginTop: 0 }}><span>Target KPI</span></div>
            <table className="rp-mini rp-form">
              <thead><tr><th>Metrik</th><th>3 bulan</th><th>6 bulan</th></tr></thead>
              <tbody>
                {TARGET_METRICS.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{m.label}{m.unit ? ` (${m.unit})` : ""}</th>
                    {[3, 6].map((h) => (
                      <td key={h}>
                        <input className="field mono" inputMode="decimal" value={t[`${m.id}|${h}`]} onChange={(e) => setT({ ...t, [`${m.id}|${h}`]: e.target.value })} aria-label={`${m.label} ${h} bulan`} placeholder="—" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="list-label"><span>Kuota konten kontrak</span></div>
            {active.map((p) => (
              <div key={p.id} className="rp-quota-form">
                <span className="pf-badge" style={{ "--pf": p.color }}>{p.short}</span>
                <input className="field mono" inputMode="numeric" value={q[p.id].quota} onChange={(e) => setQ({ ...q, [p.id]: { ...q[p.id], quota: e.target.value.replace(/\D/g, "") } })} placeholder="Jumlah" aria-label={`Kuota ${p.name}`} />
                <input type="date" className="field mono" value={q[p.id].start} onChange={(e) => setQ({ ...q, [p.id]: { ...q[p.id], start: e.target.value } })} aria-label={`Mulai kontrak ${p.name}`} />
                <input type="date" className="field mono" value={q[p.id].end} onChange={(e) => setQ({ ...q, [p.id]: { ...q[p.id], end: e.target.value } })} aria-label={`Akhir kontrak ${p.name}`} />
              </div>
            ))}
            {invalidQuota && <p className="text-err" style={{ margin: "6px 0 0" }}>Kuota perlu tanggal mulai dan akhir, dan tanggal mulai harus sebelum tanggal akhir.</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button className="btn btn-secondary" onClick={onClose}>Batal</button>
              <button className="btn btn-primary" onClick={submit} disabled={invalidQuota}>Simpan</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
