"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as cdb from "@/lib/contentData";
import { STAGES, STAGE_BY_ID, APPROVALS, APPROVAL_BY_ID } from "@/lib/contentData";
import { exportContentPlan } from "@/lib/exportContent";
import Icon from "@/components/icons";
import TaskFeed from "@/components/TaskFeed";
import ReportView from "@/components/ReportView";
import Select from "@/components/Select";
import { METRIC_FIELDS, hasValues, engagementOf, actionsOf, erOf, fmtInt, fmtPct } from "@/lib/contentMetrics";

// Ruang kerja Content plan: kalender, pipeline per tahap produksi, dan tabel.
// Klien, anggota, pencarian, notifikasi & status simpan dibagi dengan ruang kerja Project (AgencyTracker).

const PLATFORM_COLORS = ["#C13584", "#0A66C2", "#111111", "#1877F2", "#FF0000", "#0E7C7B", "#C97A1A", "#5B4EA8", "#B4453F", "#6B6A64"];
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fmtDay(d, opts = { weekday: "short", day: "numeric", month: "short" }) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", opts) : "";
}

function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 24) || "platform";
}

function weekRange(todayStr) {
  const t = new Date(todayStr + "T00:00:00");
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return [ymd(start), ymd(end)];
}

function ApprovalChip({ value, small }) {
  const a = APPROVAL_BY_ID[value] || APPROVALS[0];
  if (value === "none" && small) return null;
  return <span className={`apv is-${a.tone} ${small ? "is-small" : ""}`}>{a.label}</span>;
}

const STAGE_OPTIONS = STAGES.map((s) => ({ value: s.id, label: s.label, leading: <span className={`status-dot ${s.dot}`} style={{ color: s.color }} /> }));

const platformOption = (p) => ({
  value: p.id,
  label: `${p.name}${p.archived ? " (arsip)" : ""}`,
  leading: <span className="pf-badge is-mini" style={{ "--pf": p.color }}>{p.short}</span>,
});

function EmptyAvatar({ size = 18 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: "var(--sunken)", color: "var(--faint)" }}>
      <Icon name="user" size={Math.round(size * 0.55)} />
    </span>
  );
}

function PlatformTag({ platform, format }) {
  if (!platform) return null;
  return (
    <span className="pf-tag" style={{ "--pf": platform.color }}>
      <span className="pf-badge">{platform.short}</span>
      {format && <span className="pf-format">{format}</span>}
    </span>
  );
}

export default function ContentPlan({
  clients, activeClients, activeClient, query, profiles, currentUserId, isAdmin, Avatar, profileOf, clientOf,
  todayStr, persist, onCounts, newTick, openPostRequest, platformDialogTick,
}) {
  const [platforms, setPlatforms] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [targets, setTargets] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("calendar"); // calendar | pipeline | table | report
  const [personFilter, setPersonFilter] = useState("all"); // all | me | none | id
  const [platformFilter, setPlatformFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // tahap (pipeline) atau tanggal (kalender)
  const [cursor, setCursor] = useState(() => {
    const t = todayStr ? new Date(todayStr + "T00:00:00") : new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [platformDialog, setPlatformDialog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dragRef = useRef(null);
  dragRef.current = dragId;

  async function load() {
    try {
      const board = await cdb.fetchContentBoard();
      setPlatforms(board.platforms);
      setPosts(board.posts);
      setFollowers(board.followers);
      setTargets(board.targets);
      setQuotas(board.quotas);
      setInsights(board.insights);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Gagal memuat content plan");
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    try {
      const saved = localStorage.getItem("traicker:content-view");
      if (saved === "pipeline" || saved === "table" || saved === "report") setView(saved);
    } catch {}
    // Realtime: perubahan konten & platform dari anggota lain.
    let timer;
    const run = () => {
      if (dragRef.current) {
        timer = setTimeout(run, 500);
        return;
      }
      load();
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 400);
    };
    const channel = supabase
      .channel("content-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_posts" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_platforms" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_followers" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_targets" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_quotas" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_insights" }, schedule)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeView(next) {
    setView(next);
    try {
      localStorage.setItem("traicker:content-view", next);
    } catch {}
  }

  // Simpan lewat persist milik AgencyTracker (status "Menyimpan…"), dan muat ulang kalau ditolak.
  function save(write) {
    persist(async () => {
      try {
        await write();
      } catch (e) {
        load();
        throw e;
      }
    });
  }

  const platformOf = (id) => platforms.find((p) => p.id === id) || null;
  const activePlatforms = platforms.filter((p) => !p.archived);
  const canEditPost = (p) => isAdmin || (!!currentUserId && (p.specialist === currentUserId || p.designer === currentUserId));
  const canDeletePost = (p) => isAdmin || (!!currentUserId && p.createdBy === currentUserId);
  const archivedClientIds = new Set(clients.filter((c) => c.archived).map((c) => c.id));

  const visiblePosts = posts
    .filter((p) => !archivedClientIds.has(p.client))
    .filter((p) => activeClient === "all" || p.client === activeClient)
    .filter((p) => platformFilter === "all" || p.platform === platformFilter)
    .filter((p) => {
      if (personFilter === "all") return true;
      if (personFilter === "none") return !p.specialist && !p.designer;
      const who = personFilter === "me" ? currentUserId : personFilter;
      return p.specialist === who || p.designer === who;
    })
    .filter((p) => {
      const q = query.trim().toLowerCase();
      return !q || [p.title, p.caption, p.pillar, p.hashtags].some((s) => (s || "").toLowerCase().includes(q));
    })
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.time || "99").localeCompare(b.time || "99"));

  // Jumlah konten yang belum tayang per klien, untuk angka di sidebar.
  const countsKey = posts.map((p) => `${p.id}:${p.client}:${p.status}`).join("|");
  useEffect(() => {
    const counts = {};
    for (const p of posts) if (p.status !== "published") counts[p.client] = (counts[p.client] || 0) + 1;
    onCounts(counts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey]);

  // Tombol "Konten baru" di topbar.
  const firstTick = useRef(newTick);
  useEffect(() => {
    if (newTick === firstTick.current) return;
    openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTick]);

  // Dari notifikasi: buka konten tertentu.
  useEffect(() => {
    if (!openPostRequest || !loaded) return;
    const p = posts.find((x) => x.id === openPostRequest.id);
    if (p) openEdit(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPostRequest, loaded]);

  // Menu "Kelola platform" di sidebar.
  const firstPlatformTick = useRef(platformDialogTick);
  useEffect(() => {
    if (platformDialogTick === firstPlatformTick.current) return;
    setPlatformDialog(true);
  }, [platformDialogTick]);

  // Esc menutup panel / dialog milik ruang kerja ini.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (platformDialog) setPlatformDialog(false);
      else if (editing) setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [platformDialog, editing]);

  function openNew(date) {
    const platform = activePlatforms[0];
    setEditing({
      id: crypto.randomUUID(),
      isNew: true,
      client: activeClient !== "all" ? activeClient : activeClients[0]?.id,
      platform: platform?.id,
      format: platform?.formats?.[0] || "",
      title: "",
      date: date || todayStr,
      time: "",
      pillar: "",
      brief: "",
      caption: "",
      hashtags: "",
      visualLink: "",
      postLink: "",
      status: "brief",
      approval: "none",
      approvalNote: "",
      // Member yang membuat konten otomatis jadi sosmed specialist-nya; admin bebas memilih.
      specialist: isAdmin ? null : currentUserId,
      designer: null,
      createdBy: currentUserId,
      metrics: {},
      boosted: false,
      insight: "",
    });
  }

  function openEdit(p) {
    setEditing({ ...p });
  }

  function savePost() {
    if (!editing.title.trim()) return;
    const { isNew, ...post } = editing;
    const original = isNew ? null : posts.find((p) => p.id === post.id);
    post.approvalChanged = !original || original.approval !== post.approval;
    post.metricsChanged = METRIC_FIELDS.some((f) => (original?.metrics?.[f.key] ?? null) !== (post.metrics?.[f.key] ?? null));
    const { approvalChanged, metricsChanged, ...local } = post;
    if (metricsChanged) local.metricsUpdatedAt = new Date().toISOString();
    if (isNew) setPosts((prev) => [...prev, local]);
    else setPosts((prev) => prev.map((p) => (p.id === post.id ? local : p)));
    setEditing(null);
    save(() => cdb.savePost(post, isNew));
  }

  function removePost(p) {
    if (!window.confirm(`Hapus konten "${p.title}"?`)) return;
    setPosts((prev) => prev.filter((x) => x.id !== p.id));
    setEditing(null);
    save(() => cdb.deletePost(p.id));
  }

  function patchPost(p, fields) {
    if (!canEditPost(p)) return;
    setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...fields } : x)));
    save(() => cdb.updatePostFields(p.id, fields));
  }

  async function runExport() {
    if (exporting || visiblePosts.length === 0) return;
    setExporting(true);
    try {
      await exportContentPlan(visiblePosts, { clientOf, platformOf, profileOf, clientName: activeClient === "all" ? "" : clientOf(activeClient).name });
    } catch (e) {
      console.error(e);
    }
    setExporting(false);
  }

  if (!loaded) return <div className="page-head"><span className="text-muted">Memuat content plan…</span></div>;
  if (loadError) {
    return (
      <div className="page-head" style={{ display: "grid", gap: 10 }}>
        <div className="auth-error"><Icon name="alert" size={14} /><span>Gagal memuat: {loadError}</span></div>
        <button className="btn btn-secondary" onClick={load} style={{ justifySelf: "start" }}>Coba lagi</button>
      </div>
    );
  }

  // ---- Ringkasan ----
  const [wkStart, wkEnd] = todayStr ? weekRange(todayStr) : ["", ""];
  const thisWeek = visiblePosts.filter((p) => p.date >= wkStart && p.date <= wkEnd).length;
  const waiting = visiblePosts.filter((p) => p.approval === "waiting").length;
  const late = visiblePosts.filter((p) => p.date && p.date < todayStr && !["scheduled", "published"].includes(p.status)).length;
  const viewClient = activeClient === "all" ? null : clientOf(activeClient);
  // Pilihan orang untuk dropdown (avatar + nama).
  const personOptions = profiles.map((p) => ({
    value: p.id,
    label: `${p.name}${p.id === currentUserId ? " (saya)" : ""}`,
    leading: <Avatar profile={p} size={18} />,
    group: "Anggota",
  }));

  return (
    <>
      <section className="page-head">
        <div>
          <p className="kicker-ws"><Icon name="calendar" size={12} /> Content plan</p>
          <h1 className="page-title">{viewClient ? viewClient.name : <>Semua <em>klien</em></>}</h1>
          <div className="page-meta">
            <span className="mono">{visiblePosts.length}</span> konten
            <span className="sep">·</span>
            <span className="mono">{thisWeek}</span> minggu ini
            {waiting > 0 && (<><span className="sep">·</span><span className="apv is-warn">{waiting} menunggu klien</span></>)}
            {late > 0 && (<><span className="sep">·</span><span className="attention-btn is-danger" style={{ cursor: "default" }}><span className="pulse" />{late} lewat jadwal</span></>)}
          </div>
        </div>

        <div className="toolbar">
          <div className="segmented view-switch" role="tablist" aria-label="Tampilan content plan">
            {[
              ["calendar", "Kalender", "calendar"],
              ["pipeline", "Pipeline", "columns"],
              ["table", "Tabel", "note"],
              ["report", "Report", "flag"],
            ].map(([id, label, icon]) => (
              <button key={id} role="tab" aria-selected={view === id} className={view === id ? "is-active" : ""} onClick={() => changeView(id)}>
                <Icon name={icon} size={13} />
                {label}
              </button>
            ))}
          </div>
          {view !== "report" && (
            <>
              <Select
                variant="toolbar"
                active={platformFilter !== "all"}
                value={platformFilter}
                onChange={setPlatformFilter}
                ariaLabel="Filter platform"
                options={[{ value: "all", label: "Semua platform", leading: <Icon name="columns" size={14} /> }, ...platforms.map(platformOption)]}
              />
              <Select
                variant="toolbar"
                active={personFilter !== "all"}
                value={personFilter}
                onChange={setPersonFilter}
                ariaLabel="Filter orang"
                searchPlaceholder="Cari anggota…"
                options={[
                  { value: "all", label: "Semua orang", leading: <Icon name="users" size={14} /> },
                  { value: "me", label: "Konten saya", leading: <Icon name="user" size={14} /> },
                  { value: "none", label: "Belum ada PIC", leading: <EmptyAvatar /> },
                  ...personOptions,
                ]}
              />
              <button className="btn btn-secondary btn-sm toolbar-export" onClick={runExport} disabled={exporting || visiblePosts.length === 0} title="Export Excel konten yang sedang tampil">
                {exporting ? <span className="spinner" /> : <Icon name="download" size={13} />}
                Export
              </button>
            </>
          )}
        </div>
      </section>

      {posts.length === 0 && view !== "report" && (
        <div className="cp-empty">
          <h3>Mulai content plan pertamamu</h3>
          <p>Buat konten untuk tiap klien: platform, jadwal tayang, brief, caption, dan link visual. Klik <b>Konten baru</b> di atas.</p>
        </div>
      )}

      {view === "calendar" && (
        <ContentCalendar
          posts={visiblePosts}
          cursor={cursor}
          setCursor={setCursor}
          todayStr={todayStr}
          platformOf={platformOf}
          clientOf={clientOf}
          canEditPost={canEditPost}
          dragId={dragId}
          setDragId={setDragId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          onOpen={openEdit}
          onNew={(date) => openNew(date)}
          onMove={(p, date) => p.date !== date && patchPost(p, { date })}
        />
      )}

      {view === "pipeline" && (
        <div className="board">
          {STAGES.map((stage) => {
            const list = visiblePosts.filter((p) => p.status === stage.id);
            const isDrop = dragId && dropTarget === stage.id;
            return (
              <section
                key={stage.id}
                className={`column ${isDrop ? "is-drop" : ""}`}
                onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setDropTarget(stage.id); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const p = posts.find((x) => x.id === dragId);
                  setDragId(null);
                  setDropTarget(null);
                  if (p && p.status !== stage.id) patchPost(p, { status: stage.id });
                }}
              >
                <header className="column-head">
                  <span className={`status-dot ${stage.dot}`} style={{ color: stage.color }} />
                  <span className="column-title">{stage.label}</span>
                  <span className="column-count">{list.length}</span>
                </header>
                <div className="column-body">
                  {list.map((p, i) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      index={i}
                      platform={platformOf(p.platform)}
                      client={clientOf(p.client)}
                      people={[profileOf(p.specialist), profileOf(p.designer)].filter(Boolean)}
                      Avatar={Avatar}
                      todayStr={todayStr}
                      draggable={canEditPost(p)}
                      dragging={dragId === p.id}
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                      onOpen={() => openEdit(p)}
                      onMove={(status) => patchPost(p, { status })}
                    />
                  ))}
                  {list.length === 0 && <div className="empty-col">{isDrop ? "Lepas di sini" : "Kosong"}</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {view === "table" && (
        <div className="cp-table-wrap">
          <div className="cp-table-scroll">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Tayang</th>
                  <th>Platform</th>
                  <th>Judul</th>
                  <th>Klien</th>
                  <th>Tahap</th>
                  <th>Approval</th>
                  <th>Sosmed</th>
                  <th>Desainer</th>
                  <th aria-label="Link visual" />
                </tr>
              </thead>
              <tbody>
                {visiblePosts.map((p) => {
                  const pf = platformOf(p.platform);
                  const st = STAGE_BY_ID[p.status];
                  const isLate = p.date && p.date < todayStr && !["scheduled", "published"].includes(p.status);
                  return (
                    <tr key={p.id} onClick={() => openEdit(p)}>
                      <td className={`mono ${isLate ? "is-late" : ""}`} style={{ whiteSpace: "nowrap" }}>
                        {p.date ? fmtDay(p.date, { weekday: "short", day: "numeric", month: "short" }) : "—"}
                        {p.time && <span className="cp-time"> {p.time}</span>}
                      </td>
                      <td><PlatformTag platform={pf} format={p.format} /></td>
                      <td className="cp-title-cell">{p.title}{p.pillar && <span className="cp-pillar">{p.pillar}</span>}</td>
                      <td className="text-muted" style={{ fontSize: 12.5 }}>{clientOf(p.client).short}</td>
                      <td style={{ whiteSpace: "nowrap" }}><span className={`status-dot ${st.dot}`} style={{ color: st.color, display: "inline-block", verticalAlign: "-1px", marginRight: 6 }} />{st.label}</td>
                      <td><ApprovalChip value={p.approval} /></td>
                      <td>{profileOf(p.specialist) ? <Avatar profile={profileOf(p.specialist)} size={22} /> : <span className="text-muted">—</span>}</td>
                      <td>{profileOf(p.designer) ? <Avatar profile={profileOf(p.designer)} size={22} /> : <span className="text-muted">—</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {p.visualLink && (
                          <a className="btn btn-ghost btn-icon btn-sm" href={p.visualLink} target="_blank" rel="noopener noreferrer" aria-label="Buka visual" title="Buka visual">
                            <Icon name="link" size={14} />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visiblePosts.length === 0 && (
                  <tr><td colSpan={9} className="text-muted" style={{ padding: 24, textAlign: "center" }}>Belum ada konten yang cocok dengan filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "report" && (
        <ReportView
          posts={posts.filter((p) => !archivedClientIds.has(p.client))}
          platforms={platforms}
          clients={clients}
          activeClients={activeClients}
          activeClient={activeClient}
          followers={followers}
          targets={targets}
          quotas={quotas}
          insights={insights}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          clientOf={clientOf}
          profileOf={profileOf}
          todayStr={todayStr}
          onOpen={openEdit}
          save={save}
          setFollowers={setFollowers}
          setTargets={setTargets}
          setQuotas={setQuotas}
          setInsights={setInsights}
        />
      )}

      {editing && (
        <PostDrawer
          editing={editing}
          setEditing={setEditing}
          saved={editing.isNew ? null : posts.find((p) => p.id === editing.id)}
          clients={clients}
          platforms={platforms}
          posts={posts}
          profiles={profiles}
          personOptions={personOptions}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          canEditPost={canEditPost}
          canDeletePost={canDeletePost}
          clientOf={clientOf}
          platformOf={platformOf}
          profileOf={profileOf}
          Avatar={Avatar}
          onSave={savePost}
          onDelete={removePost}
        />
      )}

      {platformDialog && isAdmin && (
        <PlatformDialog
          platforms={platforms}
          posts={posts}
          onClose={() => setPlatformDialog(false)}
          onChange={(next) => setPlatforms(next)}
          save={save}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Kartu konten (pipeline)

function PostCard({ post: p, index, platform, client, people, Avatar, todayStr, draggable, dragging, onDragStart, onDragEnd, onOpen, onMove }) {
  const isLate = p.date && p.date < todayStr && !["scheduled", "published"].includes(p.status);
  return (
    <article
      className={`card ${draggable ? "is-draggable" : ""} ${dragging ? "is-dragging" : ""}`}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
    >
      <div className="card-top">
        <PlatformTag platform={platform} format={p.format} />
        <span className="client-tag" style={{ marginLeft: 4 }}>
          <span className="dot" style={{ background: client.color, width: 7, height: 7 }} />
          <span>{client.short}</span>
        </span>
        {draggable && (
          <Select
            variant="icon"
            className="card-move"
            icon={<Icon name="columns" size={12} />}
            value={p.status}
            onChange={onMove}
            ariaLabel={`Pindahkan "${p.title}" ke tahap`}
            options={STAGE_OPTIONS}
          />
        )}
      </div>
      <div className="card-title">{p.title}</div>
      {p.pillar && <div className="cp-pillar" style={{ marginTop: -4 }}>{p.pillar}</div>}
      {p.approval !== "none" && (
        <div style={{ marginTop: -2 }}>
          <ApprovalChip value={p.approval} small />
        </div>
      )}
      <div className="card-foot">
        {p.date ? (
          <span className={`due ${isLate ? "is-late" : ""} ${p.status === "published" ? "is-done" : ""}`}>
            <Icon name="calendar" size={12} />
            {fmtDay(p.date, { day: "numeric", month: "short" })}{p.time ? ` · ${p.time}` : ""}
          </span>
        ) : (
          <span className="due"><Icon name="calendar" size={12} />Belum dijadwalkan</span>
        )}
        <span className="grow" />
        {people.length > 0 && <span className="avatar-stack">{people.map((pp, i) => <Avatar key={pp.id + i} profile={pp} size={22} />)}</span>}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// Kalender bulanan + agenda (HP)

function ContentCalendar({ posts, cursor, setCursor, todayStr, platformOf, clientOf, canEditPost, dragId, setDragId, dropTarget, setDropTarget, onOpen, onNew, onMove }) {
  const byDay = useMemo(() => {
    const map = {};
    for (const p of posts) if (p.date) (map[p.date] ||= []).push(p);
    return map;
  }, [posts]);
  const undated = posts.filter((p) => !p.date);

  const offset = (cursor.getDay() + 6) % 7;
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const shift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-`;
  const monthDays = Object.keys(byDay).filter((k) => k.startsWith(prefix)).sort();

  const chip = (p, compact) => {
    const pf = platformOf(p.platform);
    const isLate = p.date && p.date < todayStr && !["scheduled", "published"].includes(p.status);
    return (
      <button
        key={p.id}
        className={`calendar-chip cp-chip ${p.status === "published" ? "is-done" : ""} ${isLate ? "is-late" : ""}`}
        style={{ "--chip": pf?.color || "#888" }}
        draggable={canEditPost(p)}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); setDragId(p.id); }}
        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
        onClick={(e) => { e.stopPropagation(); onOpen(p); }}
        title={`${pf?.name || ""} ${p.format || ""} · ${p.title} · ${clientOf(p.client).name}`}
      >
        <span className="pf-badge is-mini" style={{ "--pf": pf?.color || "#888" }}>{pf?.short || "?"}</span>
        {!compact && p.time && <span className="cp-time">{p.time}</span>}
        <span className="calendar-chip-text">{p.title}</span>
        {compact && <span className="agenda-client">{clientOf(p.client).short}</span>}
      </button>
    );
  };

  return (
    <div className="calendar-wrap">
      <div className="calendar-bar">
        <div className="calendar-title serif">{cursor.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Icon name="chevronLeft" size={14} /></button>
          <button className="btn btn-secondary btn-sm" onClick={() => { const t = new Date(todayStr + "T00:00:00"); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); }}>Hari ini</button>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => shift(1)} aria-label="Bulan berikutnya"><Icon name="chevronRight" size={14} /></button>
        </div>
      </div>

      <div className="calendar">
        {DOW.map((d) => <div key={d} className="calendar-dow">{d}</div>)}
        {cells.map((date) => {
          const key = ymd(date);
          const items = byDay[key] || [];
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div
              key={key}
              className={`calendar-cell cp-cell ${date.getMonth() === cursor.getMonth() ? "" : "is-out"} ${weekend ? "is-weekend" : ""} ${dragId && dropTarget === key ? "is-drop" : ""}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropTarget(key); } }}
              onDrop={(e) => {
                e.preventDefault();
                const p = posts.find((x) => x.id === dragId);
                setDragId(null);
                setDropTarget(null);
                if (p) onMove(p, key);
              }}
              onDoubleClick={() => onNew(key)}
            >
              <div className="cp-cell-head">
                <span className={`calendar-date ${key === todayStr ? "is-today" : ""}`}>{date.getDate()}</span>
                <button className="cp-add" onClick={() => onNew(key)} aria-label={`Konten baru tanggal ${date.getDate()}`} title="Konten baru di tanggal ini">
                  <Icon name="plus" size={12} />
                </button>
              </div>
              <div className="calendar-items">
                {items.slice(0, 4).map((p) => chip(p, false))}
                {items.length > 4 && <span className="calendar-more">+{items.length - 4} lagi</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="calendar-agenda">
        {monthDays.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>Belum ada konten di bulan ini.</p>
        ) : (
          monthDays.map((key) => {
            const d = new Date(key + "T00:00:00");
            return (
              <div key={key} className={`agenda-day ${key === todayStr ? "is-today" : ""}`}>
                <div className="agenda-date">
                  <span className="mono">{d.getDate()}</span>
                  <span>{d.toLocaleDateString("id-ID", { weekday: "short" })}</span>
                </div>
                <div className="agenda-items">
                  {byDay[key].map((p) => (
                    <button key={p.id} className="calendar-chip cp-agenda-chip" style={{ "--chip": platformOf(p.platform)?.color || "#888" }} onClick={() => onOpen(p)}>
                      <span className="pf-badge is-mini" style={{ "--pf": platformOf(p.platform)?.color || "#888" }}>{platformOf(p.platform)?.short || "?"}</span>
                      <span className="agenda-text">{p.time ? `${p.time} · ` : ""}{p.title}</span>
                      <span className="agenda-client">{clientOf(p.client).short}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {undated.length > 0 && (
        <div className="calendar-undated">
          <span className="text-muted">Belum dijadwalkan:</span>
          {undated.map((p) => chip(p, true))}
        </div>
      )}
      <p className="text-muted" style={{ marginTop: 12 }}>Geser konten ke tanggal lain untuk mengubah jadwal tayang. Klik dua kali tanggal kosong untuk membuat konten baru.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Panel detail konten

function PostDrawer({ editing, setEditing, saved, clients, platforms, posts, personOptions, currentUserId, isAdmin, canEditPost, canDeletePost, clientOf, platformOf, profileOf, Avatar, onSave, onDelete }) {
  const canEdit = editing.isNew || (!!saved && canEditPost(saved));
  const pf = platformOf(editing.platform);
  const set = (fields) => setEditing((prev) => ({ ...prev, ...fields }));
  const charCount = (editing.caption || "").length + (editing.hashtags ? editing.hashtags.length + 2 : 0);
  const overLimit = pf?.charLimit && charCount > pf.charLimit;
  // Member wajib memegang konten yang dia buat/ubah (sesuai aturan database).
  const holdsIt = isAdmin || editing.specialist === currentUserId || editing.designer === currentUserId;
  const pillars = [...new Set(posts.map((p) => p.pillar).filter(Boolean))].sort();
  const stage = STAGE_BY_ID[editing.status];

  return (
    <>
      <div className="scrim" onClick={() => setEditing(null)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={editing.isNew ? "Konten baru" : "Detail konten"}>
        <div className="drawer-head">
          <div className="crumbs">
            <span className="dot" style={{ background: clientOf(editing.client).color }} />
            <strong>{clientOf(editing.client).name || "Klien"}</strong>
            <Icon name="chevronRight" size={13} />
            <span>{editing.isNew ? "Konten baru" : stage?.label}</span>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={() => setEditing(null)} aria-label="Tutup"><Icon name="x" /></button>
        </div>

        <div className="drawer-body">
          {!canEdit && (
            <div className="notice">
              <Icon name="lock" size={14} />
              <span>Hanya bisa dilihat. Yang bisa mengubah konten ini: admin, sosmed specialist, dan desainernya.</span>
            </div>
          )}

          <textarea
            className="title-input"
            rows={1}
            value={editing.title}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
            disabled={!canEdit}
            placeholder="Judul konten, mis. Countdown 7 hari"
            autoFocus={editing.isNew}
          />

          <div className="props">
            <div className="prop-label"><Icon name="status" size={14} />Tahap</div>
            <div className="prop-value">
              <span className={`status-dot ${stage?.dot}`} style={{ color: stage?.color }} />
              <Select variant="prop" triggerLeading={false} value={editing.status} onChange={(status) => set({ status })} disabled={!canEdit} ariaLabel="Tahap" options={STAGE_OPTIONS} />
            </div>

            <div className="prop-label"><Icon name="folder" size={14} />Klien</div>
            <div className="prop-value">
              <span className="dot" style={{ background: clientOf(editing.client).color }} />
              <Select
                variant="prop"
                triggerLeading={false}
                value={editing.client}
                onChange={(client) => set({ client })}
                disabled={!canEdit}
                ariaLabel="Klien"
                searchPlaceholder="Cari klien…"
                options={clients.filter((c) => !c.archived || c.id === editing.client).map((c) => ({ value: c.id, label: c.name, leading: <span className="sel-swatch" style={{ "--swatch": c.color }} /> }))}
              />
            </div>

            <div className="prop-label"><Icon name="columns" size={14} />Platform</div>
            <div className="prop-value cp-two">
              <Select
                variant="prop"
                value={editing.platform}
                onChange={(id) => {
                  const next = platformOf(id);
                  set({ platform: id, format: next?.formats?.includes(editing.format) ? editing.format : next?.formats?.[0] || "" });
                }}
                disabled={!canEdit}
                ariaLabel="Platform"
                options={platforms.filter((p) => !p.archived || p.id === editing.platform).map(platformOption)}
              />
              <input className="field" list="cp-formats" value={editing.format} onChange={(e) => set({ format: e.target.value })} disabled={!canEdit} placeholder="Format" aria-label="Format" />
              <datalist id="cp-formats">{(pf?.formats || []).map((f) => <option key={f} value={f} />)}</datalist>
            </div>

            <div className="prop-label"><Icon name="calendar" size={14} />Tayang</div>
            <div className="prop-value cp-two">
              <input type="date" className="field mono" value={editing.date} onChange={(e) => set({ date: e.target.value })} disabled={!canEdit} aria-label="Tanggal tayang" />
              <input type="time" className="field mono" value={editing.time} onChange={(e) => set({ time: e.target.value })} disabled={!canEdit} aria-label="Jam tayang" />
            </div>

            <div className="prop-label"><Icon name="flag" size={14} />Pilar</div>
            <div className="prop-value">
              <input className="field" list="cp-pillars" value={editing.pillar} onChange={(e) => set({ pillar: e.target.value })} disabled={!canEdit} placeholder="mis. Edukasi, Hype event, Testimoni" />
              <datalist id="cp-pillars">{pillars.map((p) => <option key={p} value={p} />)}</datalist>
            </div>

            <div className="prop-label"><Icon name="user" size={14} />Sosmed</div>
            <div className="prop-value">
              {profileOf(editing.specialist) ? <Avatar profile={profileOf(editing.specialist)} size={22} /> : <span className="avatar" style={{ width: 22, height: 22, background: "var(--sunken)", color: "var(--faint)" }}><Icon name="user" size={12} /></span>}
              <Select
                variant="prop"
                triggerLeading={false}
                value={editing.specialist || ""}
                onChange={(v) => set({ specialist: v || null })}
                disabled={!canEdit}
                ariaLabel="Sosmed specialist"
                searchPlaceholder="Cari anggota…"
                options={[{ value: "", label: "Belum ada sosmed specialist", leading: <EmptyAvatar /> }, ...personOptions]}
              />
            </div>

            <div className="prop-label"><Icon name="edit" size={14} />Desainer</div>
            <div className="prop-value">
              {profileOf(editing.designer) ? <Avatar profile={profileOf(editing.designer)} size={22} /> : <span className="avatar" style={{ width: 22, height: 22, background: "var(--sunken)", color: "var(--faint)" }}><Icon name="user" size={12} /></span>}
              <Select
                variant="prop"
                triggerLeading={false}
                value={editing.designer || ""}
                onChange={(v) => set({ designer: v || null })}
                disabled={!canEdit}
                ariaLabel="Desainer"
                searchPlaceholder="Cari anggota…"
                options={[{ value: "", label: "Belum ada desainer", leading: <EmptyAvatar /> }, ...personOptions]}
              />
            </div>
            {canEdit && !holdsIt && <div className="prop-hint" style={{ color: "var(--danger)" }}>Pilih dirimu sebagai sosmed specialist atau desainer supaya bisa menyimpan.</div>}

            <div className="prop-label"><Icon name="link" size={14} />Visual</div>
            <div className="prop-value">
              <input className="field" value={editing.visualLink} onChange={(e) => set({ visualLink: e.target.value })} disabled={!canEdit} placeholder="Link Canva, Drive, Figma, CapCut…" />
              {editing.visualLink && /^https?:\/\//i.test(editing.visualLink) && (
                <a className="btn btn-ghost btn-icon btn-sm" href={editing.visualLink} target="_blank" rel="noopener noreferrer" aria-label="Buka visual" title="Buka visual"><Icon name="link" size={14} /></a>
              )}
            </div>

            {(editing.status === "published" || editing.postLink) && (
              <>
                <div className="prop-label"><Icon name="check" size={14} />Postingan</div>
                <div className="prop-value">
                  <input className="field" value={editing.postLink} onChange={(e) => set({ postLink: e.target.value })} disabled={!canEdit} placeholder="Link postingan setelah tayang" />
                  {editing.postLink && /^https?:\/\//i.test(editing.postLink) && (
                    <a className="btn btn-ghost btn-icon btn-sm" href={editing.postLink} target="_blank" rel="noopener noreferrer" aria-label="Buka postingan" title="Buka postingan"><Icon name="link" size={14} /></a>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="cp-section">
            <label className="section-title" htmlFor="cp-brief">Brief</label>
            <textarea id="cp-brief" className="field" rows={3} value={editing.brief} onChange={(e) => set({ brief: e.target.value })} disabled={!canEdit} placeholder="Tujuan konten, pesan utama, referensi, CTA…" />
          </div>

          <div className="cp-section">
            <div className="section-head" style={{ marginBottom: 6 }}>
              <label className="section-title" htmlFor="cp-caption">Caption</label>
              <span className={`progress-label ${overLimit ? "text-err" : ""}`} style={{ marginLeft: "auto" }}>
                {charCount.toLocaleString("id-ID")}{pf?.charLimit ? ` / ${pf.charLimit.toLocaleString("id-ID")}` : ""}
              </span>
            </div>
            <textarea id="cp-caption" className="field" rows={6} value={editing.caption} onChange={(e) => set({ caption: e.target.value })} disabled={!canEdit} placeholder="Tulis caption di sini…" />
            <input className="field" style={{ marginTop: 8 }} value={editing.hashtags} onChange={(e) => set({ hashtags: e.target.value })} disabled={!canEdit} placeholder="#hashtag #lainnya" aria-label="Hashtag" />
            {overLimit && <p className="text-err" style={{ margin: "6px 0 0" }}>Caption + hashtag melebihi batas {pf.name} ({pf.charLimit.toLocaleString("id-ID")} karakter).</p>}
          </div>

          <div className="cp-section">
            <span className="section-title">Approval klien</span>
            <div className="segmented cp-approval" role="radiogroup" aria-label="Approval klien">
              {APPROVALS.map((a) => (
                <button key={a.id} role="radio" aria-checked={editing.approval === a.id} className={`${editing.approval === a.id ? `is-active is-${a.tone}` : ""}`} onClick={() => set({ approval: a.id })} disabled={!canEdit}>
                  {a.label}
                </button>
              ))}
            </div>
            <textarea className="field" rows={2} value={editing.approvalNote} onChange={(e) => set({ approvalNote: e.target.value })} disabled={!canEdit} placeholder="Catatan / feedback dari klien" />
            {saved?.approvalAt && saved.approval !== "none" && (
              <p className="text-muted" style={{ margin: "6px 0 0" }}>
                Ditandai {new Date(saved.approvalAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>

          {(editing.status === "published" || hasValues(editing.metrics)) && (
            <PerformanceSection editing={editing} saved={saved} set={set} canEdit={canEdit} />
          )}

          {!editing.isNew && (
            <TaskFeed
              key={editing.id}
              taskId={editing.id}
              field="post_id"
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              profileOf={profileOf}
              clientOf={(id) => clients.find((c) => c.id === id)}
              columnLabel={(id) => STAGE_BY_ID[id]?.label || id}
              platformName={(id) => platformOf(id)?.name || id}
              approvalLabel={(id) => APPROVAL_BY_ID[id]?.label || id}
              Avatar={Avatar}
            />
          )}
        </div>

        <div className="drawer-foot">
          {saved && canDeletePost(saved) && (
            <button className="btn btn-danger-ghost btn-sm" onClick={() => onDelete(saved)}>
              <Icon name="trash" size={13} />
              Hapus
            </button>
          )}
          <span className="grow" />
          <button className="btn btn-secondary" onClick={() => setEditing(null)}>{canEdit ? "Batal" : "Tutup"}</button>
          {canEdit && (
            <button className="btn btn-primary" onClick={onSave} disabled={!editing.title.trim() || !editing.platform || !editing.client || !holdsIt}>
              Simpan
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Performa konten (diisi saat report mingguan, Senin setelah konten tayang)

function PerformanceSection({ editing, saved, set, canEdit }) {
  const values = editing.metrics || {};
  const filled = hasValues(values);

  return (
    <div className="cp-section">
      <div className="section-head" style={{ marginBottom: 6 }}>
        <span className="section-title">Performa</span>
        {saved?.metricsUpdatedAt && (
          <span className="progress-label" style={{ marginLeft: "auto" }}>
            Diperbarui {new Date(saved.metricsUpdatedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <p className="cp-metric-hint">Diisi saat report mingguan (Senin setelah konten tayang). Report bulanan memakai angka akun dari Insights.</p>
      <div className="cp-metrics">
        {METRIC_FIELDS.map((f) => (
          <label key={f.key} className="cp-metric">
            <span>{f.label}</span>
            <input
              className="field mono"
              inputMode="numeric"
              value={values[f.key] ?? ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/D/g, "");
                set({ metrics: { ...values, [f.key]: raw === "" ? null : Number(raw) } });
              }}
              disabled={!canEdit}
              placeholder="—"
            />
          </label>
        ))}
      </div>
      <div className="cp-metric-sum">
        <span>Engagement <b className="mono">{filled ? fmtInt(engagementOf(editing)) : "—"}</b></span>
        <span>ER <b className="mono">{fmtPct(erOf(editing), 2)}</b></span>
        <span>Aksi <b className="mono">{filled ? fmtInt(actionsOf(editing)) : "—"}</b></span>
      </div>
      <label className="cp-boost">
        <input type="checkbox" checked={!!editing.boosted} onChange={(e) => set({ boosted: e.target.checked })} disabled={!canEdit} />
        Konten ini di-boost (iklan)
      </label>
      <textarea className="field" rows={2} value={editing.insight || ""} onChange={(e) => set({ insight: e.target.value })} disabled={!canEdit} placeholder="Insight / catatan performa, mis. reach naik karena kolaborasi" aria-label="Insight performa" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Kelola platform (admin)

const EMPTY_PLATFORM = { name: "", short: "", color: PLATFORM_COLORS[2], formats: "", charLimit: "" };

function PlatformDialog({ platforms, posts, onClose, onChange, save }) {
  const [form, setForm] = useState(EMPTY_PLATFORM);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");

  const parseFormats = (s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];

  function submit() {
    const name = form.name.trim();
    if (!name) return;
    const values = {
      name,
      short: (form.short.trim() || name.slice(0, 2)).toUpperCase().slice(0, 6),
      color: form.color,
      formats: parseFormats(form.formats),
      charLimit: form.charLimit ? Math.max(1, parseInt(form.charLimit, 10) || 0) : null,
    };
    if (editId) {
      onChange(platforms.map((p) => (p.id === editId ? { ...p, ...values } : p)));
      save(() => cdb.updatePlatform(editId, values));
    } else {
      if (platforms.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        setError("Platform dengan nama ini sudah ada.");
        return;
      }
      const base = slugify(name);
      let id = base;
      for (let i = 2; platforms.some((p) => p.id === id); i++) id = `${base}${i}`;
      const created = { id, ...values, sortOrder: platforms.reduce((m, p) => Math.max(m, p.sortOrder || 0), 0) + 1, archived: false };
      onChange([...platforms, created]);
      save(() => cdb.createPlatform(created));
    }
    setForm(EMPTY_PLATFORM);
    setEditId(null);
    setError("");
  }

  function startEdit(p) {
    setEditId(p.id);
    setForm({ name: p.name, short: p.short, color: p.color, formats: p.formats.join(", "), charLimit: p.charLimit ? String(p.charLimit) : "" });
    setError("");
  }

  function toggleArchive(p) {
    onChange(platforms.map((x) => (x.id === p.id ? { ...x, archived: !p.archived } : x)));
    save(() => cdb.setPlatformArchived(p.id, !p.archived));
  }

  function remove(p) {
    const used = posts.filter((x) => x.platform === p.id).length;
    if (used > 0) {
      setError(`"${p.name}" masih dipakai ${used} konten. Arsipkan saja supaya tidak muncul di pilihan.`);
      return;
    }
    if (!window.confirm(`Hapus platform "${p.name}"?`)) return;
    onChange(platforms.filter((x) => x.id !== p.id));
    save(() => cdb.deletePlatform(p.id));
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="dialog-wrap">
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="pf-dialog-title">
          <div className="dialog-head">
            <div style={{ flex: 1 }}>
              <h2 id="pf-dialog-title" className="dialog-title">Kelola platform</h2>
              <p className="dialog-sub">Platform media sosial yang dipakai di content plan, beserta format dan batas karakter caption.</p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Tutup"><Icon name="x" /></button>
          </div>

          <div className="dialog-body">
            <div className="panel" style={{ display: "grid", gap: 10 }}>
              <div className="form-grid">
                <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama platform, mis. TikTok" />
                <input className="field" value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} placeholder="Label, mis. TT" maxLength={6} />
              </div>
              <input className="field" value={form.formats} onChange={(e) => setForm({ ...form, formats: e.target.value })} placeholder="Format dipisah koma, mis. Video, Story, Live" />
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input className="field mono" style={{ width: 170 }} inputMode="numeric" value={form.charLimit} onChange={(e) => setForm({ ...form, charLimit: e.target.value.replace(/\D/g, "") })} placeholder="Batas karakter" aria-label="Batas karakter caption" />
                <div className="swatches">
                  {PLATFORM_COLORS.map((c) => (
                    <button key={c} className={`swatch ${form.color === c ? "is-active" : ""}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} aria-label={`Warna ${c}`} />
                  ))}
                </div>
                <span className="grow" style={{ flex: 1 }} />
                {editId && <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(null); setForm(EMPTY_PLATFORM); }}>Batal</button>}
                <button className="btn btn-primary btn-sm" onClick={submit} disabled={!form.name.trim()}>
                  <Icon name={editId ? "check" : "plus"} size={13} />
                  {editId ? "Simpan" : "Tambah"}
                </button>
              </div>
            </div>

            {error && <div className="auth-error" style={{ marginTop: 12 }}><Icon name="alert" size={14} /><span>{error}</span></div>}

            <div className="list-label"><span>Platform</span><span className="mono">{platforms.length}</span></div>
            {platforms.map((p) => {
              const used = posts.filter((x) => x.platform === p.id).length;
              return (
                <div key={p.id} className={`client-row ${p.archived ? "is-archived" : ""}`}>
                  <span className="pf-badge" style={{ "--pf": p.color }}>{p.short}</span>
                  <div className="info">
                    <div className="name">{p.name}</div>
                    <div className="sub">{p.formats.join(" · ") || "Belum ada format"}{p.charLimit ? ` · maks ${p.charLimit.toLocaleString("id-ID")} karakter` : ""} · {used} konten</div>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => startEdit(p)} aria-label={`Ubah ${p.name}`} title="Ubah"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggleArchive(p)} aria-label={p.archived ? "Pulihkan" : "Arsipkan"} title={p.archived ? "Pulihkan" : "Arsipkan"}><Icon name={p.archived ? "restore" : "archive"} size={14} /></button>
                  <button className="btn btn-danger-ghost btn-icon btn-sm" onClick={() => remove(p)} aria-label={`Hapus ${p.name}`} title={used ? "Masih dipakai — arsipkan saja" : "Hapus"} style={{ opacity: used ? 0.4 : 1 }}><Icon name="trash" size={14} /></button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
