"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/trackerData";
import Icon from "@/components/icons";

// Komentar + riwayat aktivitas satu task, diperbarui realtime.

export function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "baru saja";
  if (diff < 3600) return `${Math.round(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.round(diff / 3600)} jam lalu`;
  if (diff < 172800) return "kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: diff > 300 * 86400 ? "numeric" : undefined });
}

function fmtDay(d) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";
}

const ICONS = {
  created: "plus", status: "status", assigned: "user", due: "calendar", start: "calendar", priority: "flag",
  title: "edit", client: "folder", subtask_added: "plus", subtask_done: "check", subtask_undone: "restore",
  subtask_assigned: "user", subtask_renamed: "edit", subtask_removed: "x",
};

function describe(item, { columnLabel, personName, clientName }) {
  const m = item.meta || {};
  const q = (s) => `“${s}”`;
  switch (item.action) {
    case "created": return "membuat tugas ini";
    case "status": return <>memindahkan dari <b>{columnLabel(m.from)}</b> ke <b>{columnLabel(m.to)}</b></>;
    case "assigned": return m.to ? <>menugaskan ke <b>{personName(m.to)}</b></> : "menghapus penugasan";
    case "due": return m.to ? <>mengubah deadline ke <b>{fmtDay(m.to)}</b></> : "menghapus deadline";
    case "start": return m.to ? <>mengubah tanggal mulai ke <b>{fmtDay(m.to)}</b></> : "menghapus tanggal mulai";
    case "priority": return <>mengubah prioritas ke <b>{m.to}</b></>;
    case "title": return <>mengganti judul jadi <b>{q(m.to)}</b></>;
    case "client": return <>memindahkan ke klien <b>{clientName(m.to)}</b></>;
    case "subtask_added": return <>menambah subtask {q(m.text)}</>;
    case "subtask_done": return <>menyelesaikan {q(m.text)}</>;
    case "subtask_undone": return <>membuka lagi {q(m.text)}</>;
    case "subtask_assigned": return m.to ? <>menugaskan {q(m.text)} ke <b>{personName(m.to)}</b></> : <>menghapus penugasan {q(m.text)}</>;
    case "subtask_renamed": return <>mengganti subtask {q(m.from)} jadi {q(m.to)}</>;
    case "subtask_removed": return <>menghapus subtask {q(m.text)}</>;
    default: return item.action;
  }
}

export default function TaskFeed({ taskId, currentUserId, isAdmin, profileOf, clientOf, columnLabel, Avatar }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const endRef = useRef(null);
  const reloadTimer = useRef(null);

  async function load() {
    try {
      setItems(await db.fetchTaskFeed(taskId));
      setError("");
    } catch (e) {
      setError(e.message || "Gagal memuat komentar.");
    }
  }

  useEffect(() => {
    load();
    // Realtime: komentar & aktivitas baru di task ini langsung muncul.
    const reload = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 250);
    };
    const channel = supabase
      .channel(`task-feed-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` }, reload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_activity", filter: `task_id=eq.${taskId}` }, reload)
      .subscribe();
    return () => {
      clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await db.addComment(taskId, draft);
      setDraft("");
      await load();
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (e) {
      setError(e.message || "Gagal mengirim komentar.");
    }
    setSending(false);
  }

  async function saveEdit(id) {
    if (!editText.trim()) return;
    try {
      await db.updateComment(id, editText);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    if (!window.confirm("Hapus komentar ini?")) return;
    try {
      await db.deleteComment(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const helpers = {
    columnLabel,
    personName: (id) => profileOf(id)?.name || "anggota yang sudah dihapus",
    clientName: (id) => clientOf(id)?.name || id,
  };

  // Aktivitas lama diringkas supaya komentar tetap menonjol.
  const all = items || [];
  const activityCount = all.filter((i) => i.kind === "activity").length;
  const hiddenActivity = showAllActivity ? 0 : Math.max(0, activityCount - 6);
  let skipped = 0;
  const visible = all.filter((i) => {
    if (i.kind !== "activity" || skipped >= hiddenActivity) return true;
    skipped += 1;
    return false;
  });

  return (
    <section className="feed">
      <div className="section-head">
        <span className="section-title">Komentar &amp; aktivitas</span>
        <span className="progress-label">{all.filter((i) => i.kind === "comment").length} komentar</span>
      </div>

      {items === null && !error && <div className="text-muted" style={{ padding: "8px 0" }}>Memuat…</div>}

      {hiddenActivity > 0 && (
        <button className="btn btn-ghost btn-sm feed-more" onClick={() => setShowAllActivity(true)}>
          Tampilkan {hiddenActivity} aktivitas sebelumnya
        </button>
      )}

      <div className="feed-list">
        {visible.map((item) => {
          const person = profileOf(item.userId);
          if (item.kind === "activity") {
            return (
              <div key={item.id} className="feed-activity">
                <span className="feed-icon"><Icon name={ICONS[item.action] || "status"} size={12} /></span>
                <span className="feed-activity-text">
                  <b>{person?.name || "Sistem"}</b> {describe(item, helpers)}
                </span>
                <span className="feed-time" title={new Date(item.at).toLocaleString("id-ID")}>{timeAgo(item.at)}</span>
              </div>
            );
          }
          const mine = item.userId && item.userId === currentUserId;
          const editing = editingId === item.id;
          return (
            <div key={item.id} className="feed-comment">
              {person ? <Avatar profile={person} size={26} /> : <span className="avatar" style={{ width: 26, height: 26, background: "var(--sunken)" }} />}
              <div className="feed-bubble">
                <div className="feed-meta">
                  <b>{person?.name || "Anggota yang sudah dihapus"}</b>
                  <span className="feed-time" title={new Date(item.at).toLocaleString("id-ID")}>
                    {timeAgo(item.at)}{item.edited ? " · diedit" : ""}
                  </span>
                  {!editing && (mine || isAdmin) && (
                    <span className="feed-actions">
                      {mine && (
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditingId(item.id); setEditText(item.body); }} aria-label="Edit komentar">
                          <Icon name="edit" size={12} />
                        </button>
                      )}
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(item.id)} aria-label="Hapus komentar">
                        <Icon name="trash" size={12} />
                      </button>
                    </span>
                  )}
                </div>
                {editing ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <textarea className="field" value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(item.id); }} />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Batal</button>
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(item.id)} disabled={!editText.trim()}>Simpan</button>
                    </div>
                  </div>
                ) : (
                  <div className="feed-body">{item.body}</div>
                )}
              </div>
            </div>
          );
        })}
        {items && items.length === 0 && <div className="subtask-empty" style={{ padding: "6px 0 12px", textAlign: "left" }}>Belum ada aktivitas.</div>}
        <div ref={endRef} />
      </div>

      {error && <div className="text-err" style={{ marginBottom: 8 }}>{error}</div>}

      <div className="composer">
        <textarea
          className="field"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
          placeholder="Tulis komentar, update progres, atau feedback klien…"
          rows={2}
          maxLength={5000}
        />
        <div className="composer-foot">
          <span className="text-muted">Ctrl + Enter untuk kirim</span>
          <button className="btn btn-primary btn-sm" onClick={send} disabled={!draft.trim() || sending}>
            {sending ? <span className="spinner" style={{ borderTopColor: "var(--on-ink)" }} /> : null}
            Kirim
          </button>
        </div>
      </div>
    </section>
  );
}
