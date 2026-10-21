"use client";

import React, { useMemo, useState } from "react";
import Icon from "@/components/icons";
import Select from "@/components/Select";
import { STAGE_BY_ID } from "@/lib/contentData";
import { ROLE_LABEL } from "@/lib/roles";

// Beban kerja per orang: daftar pekerjaan yang belum selesai, gabungan Project + Content plan.
// Untuk informasi seluruh tim (siapa sedang mengerjakan apa, deadline-nya kapan).
//
// Dihitung "belum selesai":
//   - Tugas      : status selain Selesai (Perlu Dikerjakan, Sedang Berjalan, Review)
//   - Subtask    : belum dicentang, tugasnya belum Selesai, dan dipegang orang lain selain pemegang tugas
//                  (subtask di tugas miliknya sendiri sudah terwakili oleh tugasnya)
//   - Konten     : masih Content Brief / Produksi / Review internal / Revisi. Terjadwal & Tayang = selesai.
//                  Dihitung untuk sosmed specialist dan kreatifnya; kalau orangnya sama, dihitung sekali.

const TASK_STATUS = { todo: "Perlu Dikerjakan", progress: "Sedang Berjalan", review: "Review" };
const CONTENT_OPEN = new Set(["brief", "production", "internal_review", "revision"]);
const PREVIEW = 6; // jumlah pekerjaan yang langsung terlihat per orang

const fmtDay = (ymd) => new Date(ymd + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" });

function collectItems(tasks, posts) {
  const items = [];
  for (const t of tasks) {
    if (t.column === "done") continue;
    items.push({ key: `t-${t.id}`, kind: "task", people: t.assignee ? [t.assignee] : [], title: t.title, date: t.due || "", client: t.client, status: TASK_STATUS[t.column] || t.column, task: t });
    for (const s of t.subtasks || []) {
      if (s.done || !s.assignee || s.assignee === t.assignee) continue;
      items.push({ key: `s-${s.id}`, kind: "subtask", people: [s.assignee], title: s.text, parent: t.title, date: t.due || "", client: t.client, task: t });
    }
  }
  for (const p of posts) {
    if (!CONTENT_OPEN.has(p.status)) continue;
    const people = [...new Set([p.specialist, p.designer].filter(Boolean))];
    items.push({ key: `c-${p.id}`, kind: "content", people, title: p.title, date: p.date || "", client: p.client, status: STAGE_BY_ID[p.status]?.label || p.status, post: p });
  }
  return items;
}

// Urut dari deadline terdekat; yang tanpa tanggal di akhir.
const byDate = (a, b) => (a.date || "9999").localeCompare(b.date || "9999");

export default function WorkloadView({ profiles, tasks, posts, todayStr, query, currentUserId, clientOf, jobTitleOf, Avatar, onOpenTask, onOpenPost }) {
  const [sortBy, setSortBy] = useState("busy");
  const [jobFilter, setJobFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());

  const items = useMemo(() => collectItems(tasks, posts), [tasks, posts]);
  const cards = profiles.map((p) => ({ id: p.id, profile: p, items: items.filter((it) => it.people.includes(p.id)).sort(byDate) }));
  const unassigned = items.filter((it) => it.people.length === 0).sort(byDate);

  const usedJobs = [...new Set(profiles.map((p) => p.jobTitleId).filter(Boolean))];
  const q = query.trim().toLowerCase();
  const visible = cards
    .filter((c) => jobFilter === "all" || (jobFilter === "none" ? !c.profile.jobTitleId : c.profile.jobTitleId === jobFilter))
    .filter((c) => !q || c.profile.name.toLowerCase().includes(q) || jobTitleOf(c.profile.jobTitleId).toLowerCase().includes(q))
    .sort((a, b) => (sortBy === "name" ? 0 : b.items.length - a.items.length) || a.profile.name.localeCompare(b.profile.name));

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const openItem = (it) => (it.kind === "content" ? onOpenPost(it.post) : onOpenTask(it.task));
  const cardProps = { todayStr, clientOf, onOpenItem: openItem };

  return (
    <div className="wl">
      <section className="page-head">
        <div>
          <p className="kicker-ws"><Icon name="users" size={12} /> Beban kerja tim</p>
          <h1 className="page-title">Siapa sedang mengerjakan apa</h1>
          <div className="page-meta">
            <span className="mono">{items.length}</span> pekerjaan belum selesai
            {unassigned.length > 0 && (<><span className="sep">·</span><span className="apv is-warn">{unassigned.length} belum ditugaskan</span></>)}
          </div>
        </div>
        <div className="toolbar">
          <Select
            variant="toolbar"
            active={jobFilter !== "all"}
            value={jobFilter}
            onChange={setJobFilter}
            ariaLabel="Filter jabatan"
            options={[
              { value: "all", label: "Semua jabatan", leading: <Icon name="users" size={14} /> },
              ...usedJobs.map((id) => ({ value: id, label: jobTitleOf(id) || "Jabatan" })),
              { value: "none", label: "Tanpa jabatan" },
            ]}
          />
          <Select
            variant="toolbar"
            active={sortBy !== "busy"}
            value={sortBy}
            onChange={setSortBy}
            ariaLabel="Urutan"
            options={[
              { value: "busy", label: "Paling banyak dulu", leading: <Icon name="sort" size={14} /> },
              { value: "name", label: "Nama A–Z", leading: <Icon name="user" size={14} /> },
            ]}
          />
        </div>
      </section>

      <div className="wl-wrap">
        <p className="wl-note">
          Pekerjaan dihitung sampai selesai: tugas sampai pindah ke <b>Selesai</b>, subtask sampai dicentang, dan konten sampai masuk <b>Terjadwal</b>.
          Tanggal di kanan adalah deadline tugas atau tanggal tayang konten.
        </p>

        <div className="wl-grid">
          {visible.map((c) => (
            <PersonCard
              key={c.id}
              items={c.items}
              title={c.profile.name + (c.id === currentUserId ? " (saya)" : "")}
              sub={jobTitleOf(c.profile.jobTitleId) || ROLE_LABEL[c.profile.role]}
              avatar={<Avatar profile={c.profile} size={30} />}
              expanded={expanded.has(c.id)}
              onToggle={() => toggle(c.id)}
              {...cardProps}
            />
          ))}
          {unassigned.length > 0 && jobFilter === "all" && !q && (
            <PersonCard
              items={unassigned}
              title="Belum ditugaskan"
              sub="Bisa dibagikan ke anggota"
              avatar={<span className="avatar" style={{ width: 30, height: 30, background: "var(--sunken)", color: "var(--faint)" }}><Icon name="user" size={14} /></span>}
              expanded={expanded.has("unassigned")}
              onToggle={() => toggle("unassigned")}
              muted
              {...cardProps}
            />
          )}
        </div>
        {visible.length === 0 && <p className="wl-empty">Tidak ada anggota yang cocok dengan filter.</p>}
      </div>
    </div>
  );
}

function PersonCard({ items, title, sub, avatar, expanded, onToggle, todayStr, clientOf, onOpenItem, muted }) {
  const shown = expanded ? items : items.slice(0, PREVIEW);
  return (
    <section className={`wl-card ${muted ? "is-muted" : ""}`}>
      <header className="wl-card-head">
        {avatar}
        <div className="wl-name">
          <b>{title}</b>
          <span>{sub}</span>
        </div>
        <span className={`wl-count ${items.length === 0 ? "is-zero" : ""}`} title={`${items.length} pekerjaan belum selesai`}>{items.length}</span>
      </header>

      {items.length === 0 ? (
        <p className="wl-free">Tidak ada pekerjaan yang belum selesai.</p>
      ) : (
        <ul className="wl-list">
          {shown.map((it) => {
            const late = it.date && it.date < todayStr;
            const client = clientOf(it.client);
            return (
              <li key={it.key}>
                <button className="wl-item" onClick={() => onOpenItem(it)} title={`${it.title} · ${client.name} · ${it.status}`}>
                  <span className="dot" style={{ background: client.color }} aria-hidden="true" />
                  <span className="wl-item-text">
                    <span className="wl-item-title">{it.title}</span>
                    <span className="wl-item-sub">
                      {it.kind === "subtask" ? `Subtask di ${it.parent}` : `${it.kind === "content" ? "Konten" : "Tugas"} · ${it.status}`}
                    </span>
                  </span>
                  <span className={`wl-item-date ${late ? "is-late" : ""}`}>
                    {it.date ? fmtDay(it.date) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > PREVIEW && (
        <button className="wl-more" onClick={onToggle}>
          {expanded ? "Tampilkan lebih sedikit" : `Lihat semua (${items.length})`}
        </button>
      )}
    </section>
  );
}
