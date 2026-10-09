"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/trackerData";
import Icon from "@/components/icons";
import { timeAgo } from "@/components/TaskFeed";

const TYPE_ICON = { assigned: "user", subtask_assigned: "check", comment: "note" };

// Lonceng notifikasi di topbar. Data dari tabel notifications (RLS: hanya milik user yang login),
// diperbarui realtime. Notifikasi desktop ditampilkan kalau tab sedang tidak dilihat.
export default function NotificationBell({ userId, profileOf, Avatar, onOpenTask }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all"); // all | unread
  const reloadTimer = useRef(null);

  async function load() {
    try {
      setItems(await db.fetchNotifications());
    } catch {
      // Diam saja: lonceng bukan bagian penting untuk memuat papan.
    }
  }

  useEffect(() => {
    if (!userId) return;
    load();
    const reload = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 200);
    };
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        reload();
        const n = payload.new;
        try {
          if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(n.title, { body: n.body || "", tag: `traicker-${n.id}`, silent: false });
          }
        } catch {}
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, reload)
      .subscribe();
    return () => {
      clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = items.filter((n) => !n.read).length;
  const shown = filter === "unread" ? items.filter((n) => !n.read) : items;

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await db.markNotificationsRead();
    } catch {
      load();
    }
  }

  async function openItem(n) {
    setOpen(false);
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      db.markNotificationsRead([n.id]).catch(load);
    }
    if (n.taskId) onOpenTask(n.taskId);
  }

  function toggle() {
    setOpen((o) => !o);
    // Minta izin notifikasi desktop sekali, saat user membuka lonceng (bukan saat halaman dimuat).
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    } catch {}
  }

  return (
    <div className="attention">
      <button className="btn btn-ghost btn-icon bell-btn" onClick={toggle} aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`} title="Notifikasi">
        <Icon name="bell" />
        {unread > 0 && <span className="bell-badge mono">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <>
          <div className="popover-scrim" onClick={() => setOpen(false)} />
          <div className="popover align-right notif-panel">
            <div className="notif-head">
              <span className="section-title">Notifikasi</span>
              <div className="segmented" style={{ margin: 0 }}>
                <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Semua</button>
                <button className={filter === "unread" ? "is-active" : ""} onClick={() => setFilter("unread")}>Belum dibaca</button>
              </div>
            </div>
            <div className="notif-list">
              {shown.length === 0 && (
                <div className="notif-empty">
                  <Icon name="bell" size={18} />
                  {filter === "unread" ? "Semua sudah dibaca." : "Belum ada notifikasi. Kamu akan diberi tahu saat ditugaskan atau ada komentar baru."}
                </div>
              )}
              {shown.map((n) => {
                const actor = profileOf(n.actorId);
                return (
                  <button key={n.id} className={`notif-item ${n.read ? "" : "is-unread"}`} onClick={() => openItem(n)}>
                    <span className="notif-avatar">
                      {actor ? <Avatar profile={actor} size={28} /> : <span className="avatar" style={{ width: 28, height: 28, background: "var(--sunken)", color: "var(--muted)" }}><Icon name={TYPE_ICON[n.type] || "bell"} size={13} /></span>}
                    </span>
                    <span className="notif-text">
                      <span className="notif-title">{n.title}</span>
                      {n.body && <span className="notif-body">{n.body}</span>}
                      <span className="notif-time">{timeAgo(n.at)}</span>
                    </span>
                    {!n.read && <span className="notif-dot" aria-label="Belum dibaca" />}
                  </button>
                );
              })}
            </div>
            {unread > 0 && (
              <div className="notif-foot">
                <button className="btn btn-ghost btn-sm" onClick={markAll}>
                  <Icon name="check" size={13} />
                  Tandai semua sudah dibaca
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
