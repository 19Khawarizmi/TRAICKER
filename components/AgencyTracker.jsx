"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/trackerData";

const COLUMNS = [
  { id: "todo", label: "Perlu Dikerjakan" },
  { id: "progress", label: "Sedang Berjalan" },
  { id: "ongoing", label: "Ongoing (s/d Event Selesai)" },
  { id: "review", label: "Review" },
  { id: "done", label: "Selesai" },
];

const PRIORITIES = {
  Tinggi: "#B4453F",
  Sedang: "#C97A1A",
  Rendah: "#6B6A64",
};

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtDate(d) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function isOverdue(d, column, todayStr) {
  return column !== "done" && column !== "ongoing" && d < todayStr;
}

function daysUntil(d, todayStr) {
  const a = new Date(todayStr + "T00:00:00");
  const b = new Date(d + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export default function AgencyTracker() {
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeClient, setActiveClient] = useState("all");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [todayStr, setTodayStr] = useState("");
  const notifiedRef = useRef(false);
  const [saveState, setSaveState] = useState("idle");
  const [sortBy, setSortBy] = useState("default");
  const [newSubtask, setNewSubtask] = useState("");
  const [expandedSubtask, setExpandedSubtask] = useState(null);

  async function loadBoard() {
    try {
      const board = await db.fetchBoard();
      setClients(board.clients);
      setTasks(board.tasks);
      setLoadError("");
    } catch (e) {
      setLoadError(e.message || "Gagal memuat data");
    }
    setLoaded(true);
  }

  useEffect(() => {
    setTodayStr(getTodayStr());
    loadBoard();
  }, []);

  // Update UI dulu (optimistic), lalu tulis ke Supabase. Kalau gagal, muat ulang dari server.
  async function persist(write) {
    setSaveState("saving");
    try {
      await write();
      setSaveState("saved");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      loadBoard();
    }
  }

  useEffect(() => {
    if (!loaded || notifiedRef.current || !todayStr) return;
    notifiedRef.current = true;
    const urgent = tasks.filter((t) => t.column !== "done" && t.column !== "ongoing" && t.due && daysUntil(t.due, todayStr) <= 1);
    if (urgent.length === 0) return;
    try {
      if (typeof Notification === "undefined") return;
      const fire = () => {
        urgent.slice(0, 5).forEach((t) => {
          const d = daysUntil(t.due, todayStr);
          const label = d < 0 ? `Lewat ${-d} hari` : d === 0 ? "Deadline hari ini" : "Deadline besok";
          new Notification(`${label}: ${t.title}`, { body: clientOfStatic(t.client), silent: true });
        });
      };
      if (Notification.permission === "granted") fire();
      else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => { if (p === "granted") fire(); });
      }
    } catch (e) {
      // Notifikasi tidak tersedia di browser ini; banner tenggat tetap tampil.
    }
  }, [loaded, tasks, todayStr]);

  function clientOfStatic(id) {
    const c = clients.find((x) => x.id === id);
    return c ? c.name : "";
  }

  const fallbackClient = { id: "", name: "", short: "", color: "#6B6A64", tint: "#EEEDE8" };
  const clientOf = (id) => clients.find((c) => c.id === id) || clients[clients.length - 1] || fallbackClient;

  const visibleTasks = tasks
    .filter((t) => {
      const matchClient = activeClient === "all" || t.client === activeClient;
      const matchQuery = t.title.toLowerCase().includes(query.toLowerCase());
      return matchClient && matchQuery;
    })
    .sort((a, b) => {
      if (sortBy === "due") {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
      }
      if (sortBy === "client") return clientOf(a.client).name.localeCompare(clientOf(b.client).name);
      return 0;
    });

  const counts = clients.reduce((acc, c) => {
    acc[c.id] = tasks.filter((t) => t.client === c.id && t.column !== "done").length;
    return acc;
  }, {});
  const overdueCount = tasks.filter((t) => isOverdue(t.due, t.column, todayStr)).length;
  const dueSoon = tasks.filter((t) => t.column !== "done" && t.column !== "ongoing" && t.due && daysUntil(t.due, todayStr) >= 0 && daysUntil(t.due, todayStr) <= 1).sort((a, b) => (a.due < b.due ? -1 : 1));
  const overdueTasks = tasks.filter((t) => isOverdue(t.due, t.column, todayStr)).sort((a, b) => (a.due < b.due ? -1 : 1));

  function moveTask(id, column) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.column === column) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, column } : t)));
    persist(() => db.moveTask(id, column));
  }

  function deleteTask(id) {
    const task = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setModalOpen(false);
    if (task) persist(() => db.deleteTask(task));
  }

  function openNew() {
    // ID dibuat di client supaya lampiran bisa langsung di-upload sebelum tugas disimpan.
    setEditing({ id: crypto.randomUUID(), isNew: true, title: "", client: clients[0]?.id, priority: "Sedang", due: todayStr, column: "todo", subtasks: [] });
    setNewSubtask("");
    setExpandedSubtask(null);
    setModalOpen(true);
  }

  function openEdit(task) {
    setEditing({ ...task, subtasks: task.subtasks ? task.subtasks.map((s) => ({ ...s })) : [] });
    setNewSubtask("");
    setExpandedSubtask(null);
    setModalOpen(true);
  }

  function toggleSubtask(id) {
    setEditing((prev) => ({ ...prev, subtasks: prev.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) }));
  }

  function updateSubtaskField(id, field, value) {
    setEditing((prev) => ({ ...prev, subtasks: prev.subtasks.map((s) => (s.id === id ? { ...s, [field]: value } : s)) }));
  }

  async function handleSubtaskFile(id, file) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      updateSubtaskField(id, "fileError", "File maks 4MB");
      return;
    }
    updateSubtaskField(id, "fileError", "Mengupload...");
    try {
      const uploaded = await db.uploadAttachment(editing.id, id, file);
      updateSubtaskField(id, "file", uploaded);
      updateSubtaskField(id, "fileError", null);
    } catch (e) {
      updateSubtaskField(id, "fileError", "Gagal upload file");
    }
  }

  function removeSubtaskFile(id) {
    updateSubtaskField(id, "file", null);
  }

  async function openAttachment(file) {
    try {
      // Signed URL dibuat dengan opsi download, jadi browser langsung mengunduh tanpa pindah halaman.
      window.location.href = await db.attachmentUrl(file);
    } catch (e) {
      setSaveState("error");
    }
  }

  function addSubtask() {
    if (!newSubtask.trim()) return;
    setEditing((prev) => ({ ...prev, subtasks: [...(prev.subtasks || []), { id: crypto.randomUUID(), text: newSubtask.trim(), done: false }] }));
    setNewSubtask("");
  }

  function removeSubtask(id) {
    setEditing((prev) => ({ ...prev, subtasks: prev.subtasks.filter((s) => s.id !== id) }));
  }

  function saveTask() {
    if (!editing.title.trim()) return;
    const { isNew, ...task } = editing;
    task.subtasks = task.subtasks.map(({ fileError, ...s }) => s);
    const original = isNew ? null : tasks.find((t) => t.id === task.id);
    if (isNew) {
      task.position = tasks.reduce((max, t) => Math.max(max, t.position || 0), 0) + 1;
      setTasks((prev) => [...prev, task]);
    } else {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
    setModalOpen(false);
    persist(() => db.saveTask(task, original));
  }

  if (!loaded) {
    return (
      <div style={{ fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8782" }}>
        Memuat tracker...
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ fontFamily: "Inter, system-ui, sans-serif", minHeight: "100vh", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", justifyContent: "center", color: "#B4453F", fontSize: "13px" }}>
        Gagal memuat data: {loadError}
        <button onClick={loadBoard} style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "6px", border: "1px solid #D8D6CC", background: "#fff", cursor: "pointer" }}>
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#F5F4F0", color: "#232220", minHeight: "100vh" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #E2E0D8" }}>
        <div>
          <div style={{ fontFamily: "Georgia, 'Iowan Old Style', serif", fontSize: "20px", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Task Tracker — Up+Above
          </div>
          <div style={{ fontSize: "12px", color: "#8A8782", marginTop: "2px" }}>
            {tasks.length} tugas · {overdueCount > 0 ? (
              <span style={{ color: "#B4453F", fontWeight: 600 }}>{overdueCount} lewat tenggat</span>
            ) : "semua on track"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "11px", color: saveState === "error" ? "#B4453F" : "#8A8782" }}>
            {saveState === "saving" ? "menyimpan…" : saveState === "saved" ? "tersimpan" : saveState === "error" ? "gagal simpan" : ""}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari tugas..."
            style={{ fontSize: "13px", padding: "7px 12px", borderRadius: "7px", border: "1px solid #D8D6CC", outline: "none", width: "160px", background: "#fff" }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ fontSize: "13px", padding: "7px 10px", borderRadius: "7px", border: "1px solid #D8D6CC", outline: "none", background: "#fff", cursor: "pointer" }}
          >
            <option value="default">Urutan default</option>
            <option value="due">Deadline terdekat</option>
            <option value="client">Nama klien</option>
          </select>
          <button
            onClick={openNew}
            style={{ fontSize: "13px", fontWeight: 600, padding: "7px 14px", borderRadius: "7px", border: "none", background: "#232220", color: "#F5F4F0", cursor: "pointer" }}
          >
            + Tugas Baru
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ fontSize: "12px", padding: "7px 10px", borderRadius: "7px", border: "1px solid #D8D6CC", background: "#fff", color: "#5F5E5A", cursor: "pointer" }}
          >
            Keluar
          </button>
        </div>
      </div>

      {(overdueTasks.length > 0 || dueSoon.length > 0) && (
        <div style={{ padding: "10px 22px", background: "#FBEEDD", borderBottom: "1px solid #E2E0D8", fontSize: "12.5px", display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: "#8A5A1A" }}>⏰ Deadline dekat:</span>
          {overdueTasks.map((t) => (
            <span key={t.id} onClick={() => openEdit(t)} style={{ cursor: "pointer", color: "#B4453F", fontWeight: 600 }}>
              {t.title} (lewat {-daysUntil(t.due, todayStr)}h)
            </span>
          ))}
          {dueSoon.map((t) => (
            <span key={t.id} onClick={() => openEdit(t)} style={{ cursor: "pointer", color: "#8A5A1A" }}>
              {t.title} ({daysUntil(t.due, todayStr) === 0 ? "hari ini" : "besok"})
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div style={{ width: "190px", borderRight: "1px solid #E2E0D8", padding: "16px 12px", flexShrink: 0 }}>
          <div
            onClick={() => setActiveClient("all")}
            style={{
              padding: "8px 10px", borderRadius: "7px", cursor: "pointer", fontSize: "13px", fontWeight: 600,
              marginBottom: "4px", background: activeClient === "all" ? "#232220" : "transparent",
              color: activeClient === "all" ? "#fff" : "#232220",
            }}
          >
            Semua Klien
          </div>
          {clients.map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveClient(c.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", borderRadius: "7px", cursor: "pointer", fontSize: "13px",
                marginBottom: "2px", background: activeClient === c.id ? c.tint : "transparent",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                {c.short}
              </span>
              <span style={{ fontSize: "11px", color: "#8A8782" }}>{counts[c.id]}</span>
            </div>
          ))}
        </div>

        {/* Board */}
        <div style={{ flex: 1, display: "flex", gap: "14px", padding: "16px 18px", overflowX: "auto" }}>
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.column === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId && moveTask(dragId, col.id)}
                style={{ minWidth: "220px", flex: "1 1 0", background: col.id === "ongoing" ? "#FBF3E4" : "#FAF9F6", border: col.id === "ongoing" ? "1px solid #E8D5AE" : "1px solid #E2E0D8", borderRadius: "9px", padding: "10px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 10px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: col.id === "ongoing" ? "#8A5A1A" : "#5F5E5A" }}>
                    {col.id === "ongoing" && "🔁 "}{col.label}
                  </span>
                  <span style={{ fontSize: "11px", color: "#B4B2A9" }}>{colTasks.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {colTasks.map((t) => {
                    const c = clientOf(t.client);
                    const overdue = isOverdue(t.due, t.column, todayStr);
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={() => setDragId(t.id)}
                        onClick={() => openEdit(t)}
                        style={{
                          background: "#fff", borderRadius: "8px", padding: "10px 11px",
                          border: "1px solid #E7E5DC", borderLeftWidth: "3px", borderLeftColor: c.color,
                          cursor: "grab", fontSize: "13px",
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: "6px", lineHeight: 1.35 }}>{t.title}</div>
                        {t.subtasks && t.subtasks.length > 0 && (() => {
                          const doneCt = t.subtasks.filter((s) => s.done).length;
                          const total = t.subtasks.length;
                          const pct = Math.round((doneCt / total) * 100);
                          const attachCt = t.subtasks.filter((s) => s.link || s.note || s.file).length;
                          return (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                              <div style={{ flex: 1, height: "4px", background: "#EEEDE8", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: c.color }} />
                              </div>
                              <span style={{ fontSize: "10.5px", color: "#8A8782", flexShrink: 0 }}>✓ {doneCt}/{total}</span>
                              {attachCt > 0 && <span style={{ fontSize: "10.5px", flexShrink: 0 }} title={`${attachCt} lampiran`}>📎</span>}
                            </div>
                          );
                        })()}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", background: c.tint, color: c.color, fontWeight: 600 }}>
                            {c.short}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: PRIORITIES[t.priority] }} title={t.priority} />
                            <span style={{ fontSize: "11px", color: overdue ? "#B4453F" : "#8A8782", fontWeight: overdue ? 700 : 400 }}>
                              {t.column === "ongoing" ? "" : fmtDate(t.due)}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div style={{ fontSize: "12px", color: "#B4B2A9", padding: "10px 4px", textAlign: "center" }}>Kosong</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && editing && (
        <div
          onClick={() => setModalOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(35,34,32,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "10px", padding: "20px", width: "320px", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>{editing.isNew ? "Tugas Baru" : "Edit Tugas"}</div>
            <input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder="Nama tugas"
              style={{ width: "100%", boxSizing: "border-box", fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC", marginBottom: "8px" }}
            />
            <select
              value={editing.client}
              onChange={(e) => setEditing({ ...editing, client: e.target.value })}
              style={{ width: "100%", fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC", marginBottom: "8px" }}
            >
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <select
                value={editing.priority}
                onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
                style={{ flex: 1, fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC" }}
              >
                {Object.keys(PRIORITIES).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {editing.column !== "ongoing" && (
                <input
                  type="date"
                  value={editing.due}
                  onChange={(e) => setEditing({ ...editing, due: e.target.value })}
                  style={{ flex: 1, fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC" }}
                />
              )}
            </div>
            <select
              value={editing.column}
              onChange={(e) => {
                const col = e.target.value;
                setEditing({ ...editing, column: col, due: col === "ongoing" ? "" : (editing.due || todayStr) });
              }}
              style={{ width: "100%", fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC", marginBottom: "8px" }}
            >
              {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {editing.column === "ongoing" && (
              <div style={{ fontSize: "11.5px", color: "#8A5A1A", marginTop: "-4px", marginBottom: "10px" }}>
                Tugas ongoing tidak perlu tanggal atau notifikasi — aktif sampai kamu pindahkan sendiri.
              </div>
            )}
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "7px", color: "#5F5E5A", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                Subtask
              </div>
              {(editing.subtasks || []).map((s) => {
                const hasAttachment = s.link || s.note || s.file;
                const isOpen = expandedSubtask === s.id;
                return (
                  <div key={s.id} style={{ border: "1px solid #EEEDE8", borderRadius: "6px", padding: "7px 8px", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input type="checkbox" checked={s.done} onChange={() => toggleSubtask(s.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                      <span
                        onClick={() => setExpandedSubtask(isOpen ? null : s.id)}
                        style={{ flex: 1, fontSize: "13px", cursor: "pointer", textDecoration: s.done ? "line-through" : "none", color: s.done ? "#B4B2A9" : "#232220" }}
                      >
                        {s.text}
                      </span>
                      {hasAttachment && <span style={{ fontSize: "11px" }} title="Ada lampiran">📎</span>}
                      <button onClick={() => setExpandedSubtask(isOpen ? null : s.id)} style={{ fontSize: "11px", color: "#8A8782", background: "none", border: "none", cursor: "pointer" }}>
                        {isOpen ? "▲" : "▼"}
                      </button>
                      <button onClick={() => removeSubtask(s.id)} style={{ fontSize: "12px", color: "#B4B2A9", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}>
                        ✕
                      </button>
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: "8px", paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <input
                          value={s.link || ""}
                          onChange={(e) => updateSubtaskField(s.id, "link", e.target.value)}
                          placeholder="Link (mis. Google Drive, dokumen, dsb)"
                          style={{ fontSize: "12.5px", padding: "6px 8px", borderRadius: "5px", border: "1px solid #D8D6CC" }}
                        />
                        <textarea
                          value={s.note || ""}
                          onChange={(e) => updateSubtaskField(s.id, "note", e.target.value)}
                          placeholder="Catatan pekerjaan yang sudah dilakukan"
                          rows={2}
                          style={{ fontSize: "12.5px", padding: "6px 8px", borderRadius: "5px", border: "1px solid #D8D6CC", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <label style={{ fontSize: "12px", padding: "5px 10px", border: "1px solid #D8D6CC", borderRadius: "5px", cursor: "pointer", background: "#fff" }}>
                            📎 {s.file ? "Ganti file" : "Upload file"}
                            <input
                              type="file"
                              onChange={(e) => handleSubtaskFile(s.id, e.target.files[0])}
                              style={{ display: "none" }}
                            />
                          </label>
                          {s.file && (
                            <span style={{ fontSize: "12px", color: "#5F5E5A", display: "flex", alignItems: "center", gap: "5px" }}>
                              <a href="#" onClick={(e) => { e.preventDefault(); openAttachment(s.file); }} style={{ color: "#3D6FA6", textDecoration: "none" }}>{s.file.name}</a>
                              <button onClick={() => removeSubtaskFile(s.id)} style={{ fontSize: "11px", color: "#B4B2A9", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                            </span>
                          )}
                          {s.fileError && <span style={{ fontSize: "11px", color: "#B4453F" }}>{s.fileError}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {(!editing.subtasks || editing.subtasks.length === 0) && (
                <div style={{ fontSize: "12px", color: "#B4B2A9", marginBottom: "6px" }}>Belum ada subtask</div>
              )}
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                  placeholder="Tambah subtask, mis. request brand guideline"
                  style={{ flex: 1, fontSize: "13px", padding: "7px 9px", borderRadius: "6px", border: "1px solid #D8D6CC" }}
                />
                <button onClick={addSubtask} style={{ fontSize: "13px", padding: "7px 12px", borderRadius: "6px", border: "1px solid #D8D6CC", background: "#fff", cursor: "pointer" }}>
                  +
                </button>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {!editing.isNew ? (
                <button onClick={() => deleteTask(editing.id)} style={{ fontSize: "12px", color: "#B4453F", background: "none", border: "none", cursor: "pointer" }}>
                  Hapus
                </button>
              ) : <span />}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setModalOpen(false)} style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "6px", border: "1px solid #D8D6CC", background: "#fff", cursor: "pointer" }}>
                  Batal
                </button>
                <button onClick={saveTask} style={{ fontSize: "13px", fontWeight: 600, padding: "7px 14px", borderRadius: "6px", border: "none", background: "#232220", color: "#fff", cursor: "pointer" }}>
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
