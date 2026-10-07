"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/trackerData";
import { exportDoneTasks } from "@/lib/exportTasks";

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
  return column !== "done" && column !== "ongoing" && !!d && d < todayStr;
}

function daysUntil(d, todayStr) {
  const a = new Date(todayStr + "T00:00:00");
  const b = new Date(d + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

const AVATAR_COLORS = ["#0E7C7B", "#3D6FA6", "#8B6A3F", "#5A7D3A", "#C97A1A", "#5B4EA8", "#B4453F", "#6B6A64"];

function avatarColor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name) {
  const parts = name.replace(/[^\p{L}\p{N}\s._-]/gu, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

function Avatar({ profile, size = 20 }) {
  if (!profile) return null;
  return (
    <span
      title={`${profile.name} (${profile.email})`}
      style={{
        width: size, height: size, borderRadius: "50%", background: avatarColor(profile.id), color: "#fff",
        fontSize: Math.round(size * 0.45), fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, border: "1.5px solid #fff", boxSizing: "border-box",
      }}
    >
      {initials(profile.name)}
    </span>
  );
}

export default function AgencyTracker() {
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [assigneeFilter, setAssigneeFilter] = useState("all"); // "all" | "me" | "none" | id profil
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeClient, setActiveClient] = useState("all");
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { column, beforeId } — beforeId null = taruh di paling bawah
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [todayStr, setTodayStr] = useState("");
  const notifiedRef = useRef(false);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [newSubtask, setNewSubtask] = useState("");
  const [expandedSubtask, setExpandedSubtask] = useState(null);

  async function loadBoard() {
    try {
      const board = await db.fetchBoard();
      setClients(board.clients);
      setProfiles(board.profiles);
      setCurrentUserId(board.currentUserId);
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
    setSaveError("");
    try {
      await write();
      setSaveState("saved");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      setSaveError(e.message || "");
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
  const profileOf = (id) => (id ? profiles.find((p) => p.id === id) || null : null);

  // Orang yang terlibat di tugas: assignee tugas dulu, lalu assignee subtask (tanpa duplikat).
  function peopleOf(task) {
    const ids = [task.assignee, ...(task.subtasks || []).map((s) => s.assignee)].filter(Boolean);
    return [...new Set(ids)].map(profileOf).filter(Boolean);
  }

  // Filter "orang": cocok kalau tugasnya atau salah satu subtasknya ditugaskan ke orang itu.
  function matchesAssignee(task) {
    if (assigneeFilter === "all") return true;
    if (assigneeFilter === "none") return !task.assignee && !(task.subtasks || []).some((s) => s.assignee);
    const who = assigneeFilter === "me" ? currentUserId : assigneeFilter;
    return task.assignee === who || (task.subtasks || []).some((s) => s.assignee === who);
  }

  const visibleTasks = tasks
    .filter((t) => {
      const matchClient = activeClient === "all" || t.client === activeClient;
      const matchQuery = t.title.toLowerCase().includes(query.toLowerCase());
      return matchClient && matchQuery && matchesAssignee(t);
    })
    .sort((a, b) => {
      if (sortBy === "due") {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
      }
      if (sortBy === "client") return clientOf(a.client).name.localeCompare(clientOf(b.client).name);
      return (a.position || 0) - (b.position || 0);
    });
  // Geser urutan di dalam kolom hanya masuk akal kalau tampilan memakai urutan manual.
  const canReorder = sortBy === "default";

  // Hak akses — cerminan aturan RLS di database (yang tetap jadi penjaga utama).
  const me = profileOf(currentUserId);
  const isAdmin = me?.role === "admin";
  const canEditTask = (t) => isAdmin || (!!currentUserId && t.assignee === currentUserId);
  const canDeleteTask = (t) => isAdmin || (!!currentUserId && t.createdBy === currentUserId);
  const canWorkOnSubtask = (t, s) => canEditTask(t) || (!!currentUserId && s.assignee === currentUserId);

  const counts = clients.reduce((acc, c) => {
    acc[c.id] = tasks.filter((t) => t.client === c.id && t.column !== "done").length;
    return acc;
  }, {});
  const overdueCount = tasks.filter((t) => isOverdue(t.due, t.column, todayStr)).length;
  const dueSoon = tasks.filter((t) => t.column !== "done" && t.column !== "ongoing" && t.due && daysUntil(t.due, todayStr) >= 0 && daysUntil(t.due, todayStr) <= 1).sort((a, b) => (a.due < b.due ? -1 : 1));
  const overdueTasks = tasks.filter((t) => isOverdue(t.due, t.column, todayStr)).sort((a, b) => (a.due < b.due ? -1 : 1));

  function endDrag() {
    setDragId(null);
    setDropTarget(null);
  }

  function updateDropTarget(column, beforeId) {
    setDropTarget((prev) => (prev && prev.column === column && prev.beforeId === beforeId ? prev : { column, beforeId }));
  }

  // Pindahkan tugas yang sedang di-drag ke `column`, tepat sebelum `beforeId` (atau paling bawah).
  // Posisi baru = nilai di antara dua tetangga, jadi hanya tugas yang digeser yang ditulis ke Supabase
  // (member tidak punya akses mengubah posisi tugas orang lain).
  function dropTask(column, beforeId) {
    const id = dragId;
    endDrag();
    const task = tasks.find((t) => t.id === id);
    if (!task || beforeId === id || !canEditTask(task)) return;

    const columnTasks = tasks.filter((t) => t.column === column && t.id !== id).sort((a, b) => (a.position || 0) - (b.position || 0));
    let index = beforeId && canReorder ? columnTasks.findIndex((t) => t.id === beforeId) : -1;
    if (index < 0) index = columnTasks.length;

    const prev = columnTasks[index - 1]?.position;
    const next = columnTasks[index]?.position;
    const position = prev == null && next == null ? 1 : prev == null ? next - 1 : next == null ? prev + 1 : (prev + next) / 2;
    if (task.column === column && task.position === position) return;

    setTasks((list) => list.map((t) => (t.id === id ? { ...t, column, position } : t)));
    persist(() => db.moveTask(id, column, position));
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportTasks(list) {
    if (list.length === 0 || exporting) return;
    setExporting(true);
    try {
      await exportDoneTasks(list, clientOf, profileOf);
    } catch (e) {
      console.error(e);
      setSaveState("error");
    }
    setExporting(false);
  }

  function deleteTask(id) {
    const task = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setModalOpen(false);
    if (task) persist(() => db.deleteTask(task));
  }

  function openNew() {
    // ID dibuat di client supaya lampiran bisa langsung di-upload sebelum tugas disimpan.
    // Member yang membuat tugas otomatis jadi assignee-nya; admin bebas memilih.
    setEditing({ id: crypto.randomUUID(), isNew: true, title: "", client: clients[0]?.id, assignee: isAdmin ? null : currentUserId, createdBy: currentUserId, priority: "Sedang", due: todayStr, column: "todo", subtasks: [] });
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

    // Bukan admin/pemegang task: hanya simpan subtask yang ditugaskan ke dirinya (kolom pengerjaan saja).
    if (!isNew && !canEditTask(original)) {
      const mine = task.subtasks.filter((s) => s.assignee === currentUserId);
      setModalOpen(false);
      if (mine.length === 0) return;
      const byId = new Map(mine.map((s) => [s.id, s]));
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, subtasks: t.subtasks.map((s) => byId.get(s.id) || s) } : t)));
      persist(() => db.saveOwnSubtasks(mine, original.subtasks));
      return;
    }

    if (isNew) {
      task.position = tasks.reduce((max, t) => Math.max(max, t.position || 0), 0) + 1;
      setTasks((prev) => [...prev, task]);
    } else {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
    setModalOpen(false);
    persist(() => db.saveTask(task, original));
  }

  // Hak akses untuk modal yang sedang dibuka (berdasarkan versi tersimpan, bukan yang sedang diedit).
  const savedEditing = editing && !editing.isNew ? tasks.find((t) => t.id === editing.id) : null;
  const modalCanEdit = !!editing && (editing.isNew || (!!savedEditing && canEditTask(savedEditing)));
  const subtaskWorkable = (s) => modalCanEdit || (!!currentUserId && s.assignee === currentUserId);
  const modalHasOwnSubtasks = !!editing && !modalCanEdit && (editing.subtasks || []).some(subtaskWorkable);

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
            {me && (
              <>
                {" · "}
                <span title={me.email}>{me.name}</span>{" "}
                <span style={{ fontSize: "10.5px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: isAdmin ? "#232220" : "#EEEDE8", color: isAdmin ? "#fff" : "#5F5E5A" }}>
                  {isAdmin ? "Admin" : "Member"}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span title={saveError} style={{ fontSize: "11px", color: saveState === "error" ? "#B4453F" : "#8A8782", maxWidth: "220px" }}>
            {saveState === "saving" ? "menyimpan…" : saveState === "saved" ? "tersimpan" : saveState === "error" ? (saveError.includes("akses") || saveError.includes("hanya boleh") ? saveError : "gagal simpan") : ""}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari tugas..."
            style={{ fontSize: "13px", padding: "7px 12px", borderRadius: "7px", border: "1px solid #D8D6CC", outline: "none", width: "160px", background: "#fff" }}
          />
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            title="Filter berdasarkan orang yang ditugaskan"
            style={{ fontSize: "13px", padding: "7px 10px", borderRadius: "7px", border: "1px solid #D8D6CC", outline: "none", background: assigneeFilter === "all" ? "#fff" : "#E5EDF6", cursor: "pointer" }}
          >
            <option value="all">Semua orang</option>
            <option value="me">Tugas saya</option>
            <option value="none">Belum ditugaskan</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === currentUserId ? " (saya)" : ""}</option>)}
          </select>
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
            const isDone = col.id === "done";
            const isDropColumn = dragId && dropTarget?.column === col.id;
            const selectedDone = isDone ? colTasks.filter((t) => selectedIds.has(t.id)) : [];
            const allSelected = isDone && colTasks.length > 0 && selectedDone.length === colTasks.length;
            const dropLine = <div style={{ height: "3px", borderRadius: "2px", background: "#3D6FA6", margin: "-5px 0" }} />;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  updateDropTarget(col.id, null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) dropTask(col.id, dropTarget?.column === col.id ? dropTarget.beforeId : null);
                }}
                style={{
                  minWidth: "220px", flex: "1 1 0", borderRadius: "9px", padding: "10px", transition: "background 0.12s, border-color 0.12s",
                  background: isDropColumn ? "#EEF3F9" : col.id === "ongoing" ? "#FBF3E4" : "#FAF9F6",
                  border: isDropColumn ? "1px dashed #3D6FA6" : col.id === "ongoing" ? "1px solid #E8D5AE" : "1px solid #E2E0D8",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 10px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: col.id === "ongoing" ? "#8A5A1A" : "#5F5E5A" }}>
                    {isDone && colTasks.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelectedIds(allSelected ? new Set() : new Set(colTasks.map((t) => t.id)))}
                        title={allSelected ? "Batal pilih semua" : "Pilih semua tugas selesai"}
                        style={{ cursor: "pointer", margin: 0 }}
                      />
                    )}
                    {col.id === "ongoing" && "🔁 "}{col.label}
                  </span>
                  <span style={{ fontSize: "11px", color: "#B4B2A9" }}>{colTasks.length}</span>
                </div>
                {isDone && colTasks.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                    <button
                      onClick={() => exportTasks(selectedDone.length > 0 ? selectedDone : colTasks)}
                      disabled={exporting}
                      title="Download Excel"
                      style={{ flex: 1, fontSize: "11.5px", fontWeight: 600, padding: "6px 8px", borderRadius: "6px", border: "1px solid #0E7C7B", background: "#E4F3F1", color: "#0E7C7B", cursor: exporting ? "default" : "pointer", opacity: exporting ? 0.6 : 1 }}
                    >
                      {exporting ? "Menyiapkan…" : selectedDone.length > 0 ? `⬇ Export terpilih (${selectedDone.length})` : `⬇ Export semua (${colTasks.length})`}
                    </button>
                    {selectedDone.length > 0 && (
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        style={{ fontSize: "11.5px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #D8D6CC", background: "#fff", color: "#5F5E5A", cursor: "pointer" }}
                      >
                        Batal
                      </button>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", minHeight: "40px" }}>
                  {colTasks.map((t, i) => {
                    const c = clientOf(t.client);
                    const overdue = isOverdue(t.due, t.column, todayStr);
                    const nextId = colTasks[i + 1]?.id || null;
                    const showLineBefore = isDropColumn && canReorder && dropTarget.beforeId === t.id && dragId !== t.id;
                    return (
                      <React.Fragment key={t.id}>
                      {showLineBefore && dropLine}
                      <div
                        draggable={canEditTask(t)}
                        title={canEditTask(t) ? undefined : "Hanya admin atau orang yang ditugaskan yang bisa memindahkan tugas ini"}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", t.id);
                          setDragId(t.id);
                        }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => {
                          if (!dragId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "move";
                          const rect = e.currentTarget.getBoundingClientRect();
                          updateDropTarget(col.id, e.clientY < rect.top + rect.height / 2 ? t.id : nextId);
                        }}
                        onClick={() => openEdit(t)}
                        style={{
                          background: "#fff", borderRadius: "8px", padding: "10px 11px",
                          // Pakai properti border terpisah (bukan shorthand) supaya tidak bentrok dengan warna kiri saat kartu dipilih.
                          borderStyle: "solid", borderWidth: "1px 1px 1px 3px",
                          borderColor: (() => {
                            const edge = selectedIds.has(t.id) && isDone ? "#0E7C7B" : "#E7E5DC";
                            return `${edge} ${edge} ${edge} ${c.color}`;
                          })(),
                          cursor: canEditTask(t) ? "grab" : "pointer", fontSize: "13px", opacity: dragId === t.id ? 0.4 : 1,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "7px", marginBottom: "6px" }}>
                          {isDone && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(t.id)}
                              onChange={() => toggleSelected(t.id)}
                              onClick={(e) => e.stopPropagation()}
                              title="Pilih untuk export"
                              style={{ cursor: "pointer", margin: "2px 0 0", flexShrink: 0 }}
                            />
                          )}
                          <div style={{ fontWeight: 600, lineHeight: 1.35 }}>{t.title}</div>
                        </div>
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
                              {t.column === "ongoing" || !t.due ? "" : fmtDate(t.due)}
                            </span>
                            {(() => {
                              const people = peopleOf(t);
                              if (people.length === 0) return null;
                              return (
                                <span style={{ display: "flex", alignItems: "center" }}>
                                  {people.slice(0, 3).map((p, idx) => (
                                    <span key={p.id} style={{ marginLeft: idx === 0 ? 0 : "-6px" }}><Avatar profile={p} /></span>
                                  ))}
                                  {people.length > 3 && <span style={{ fontSize: "10px", color: "#8A8782", marginLeft: "3px" }}>+{people.length - 3}</span>}
                                </span>
                              );
                            })()}
                          </span>
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                  {isDropColumn && (dropTarget.beforeId === null || !canReorder) && colTasks.length > 0 && dropLine}
                  {colTasks.length === 0 && (
                    <div style={{ fontSize: "12px", color: isDropColumn ? "#3D6FA6" : "#B4B2A9", padding: "10px 4px", textAlign: "center" }}>
                      {isDropColumn ? "Lepas di sini" : "Kosong"}
                    </div>
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
            <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "12px" }}>{editing.isNew ? "Tugas Baru" : modalCanEdit ? "Edit Tugas" : "Detail Tugas"}</div>
            {!modalCanEdit && (
              <div style={{ fontSize: "11.5px", lineHeight: 1.45, color: "#5F5E5A", background: "#F5F4F0", border: "1px solid #E2E0D8", borderRadius: "6px", padding: "7px 9px", marginBottom: "10px" }}>
                {modalHasOwnSubtasks
                  ? "🔒 Tugas ini bukan milikmu. Kamu hanya bisa mengubah status, link, catatan, dan lampiran di subtask yang ditugaskan ke kamu."
                  : "🔒 Hanya bisa dilihat. Yang bisa mengubah tugas ini: admin dan orang yang ditugaskan."}
              </div>
            )}
            <input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              disabled={!modalCanEdit}
              placeholder="Nama tugas"
              style={{ width: "100%", boxSizing: "border-box", fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC", marginBottom: "8px" }}
            />
            <select
              value={editing.client}
              onChange={(e) => setEditing({ ...editing, client: e.target.value })}
              disabled={!modalCanEdit}
              style={{ width: "100%", fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC", marginBottom: "8px" }}
            >
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Avatar profile={profileOf(editing.assignee)} size={26} />
              <select
                value={editing.assignee || ""}
                onChange={(e) => setEditing({ ...editing, assignee: e.target.value || null })}
                disabled={!isAdmin}
                title={isAdmin ? "Ditugaskan ke" : "Hanya admin yang bisa mengubah penugasan"}
                style={{ flex: 1, fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC" }}
              >
                <option value="">👤 Belum ditugaskan</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === currentUserId ? " (saya)" : ""}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <select
                value={editing.priority}
                onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
                disabled={!modalCanEdit}
                style={{ flex: 1, fontSize: "13px", padding: "8px 10px", borderRadius: "6px", border: "1px solid #D8D6CC" }}
              >
                {Object.keys(PRIORITIES).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {editing.column !== "ongoing" && (
                <input
                  type="date"
                  value={editing.due}
                  onChange={(e) => setEditing({ ...editing, due: e.target.value })}
                  disabled={!modalCanEdit}
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
              disabled={!modalCanEdit}
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
                      <input type="checkbox" checked={s.done} onChange={() => toggleSubtask(s.id)} disabled={!subtaskWorkable(s)} style={{ cursor: subtaskWorkable(s) ? "pointer" : "default", flexShrink: 0 }} />
                      <span
                        onClick={() => setExpandedSubtask(isOpen ? null : s.id)}
                        style={{ flex: 1, fontSize: "13px", cursor: "pointer", textDecoration: s.done ? "line-through" : "none", color: s.done ? "#B4B2A9" : "#232220" }}
                      >
                        {s.text}
                      </span>
                      {hasAttachment && <span style={{ fontSize: "11px" }} title="Ada lampiran">📎</span>}
                      <Avatar profile={profileOf(s.assignee)} size={18} />
                      <button onClick={() => setExpandedSubtask(isOpen ? null : s.id)} style={{ fontSize: "11px", color: "#8A8782", background: "none", border: "none", cursor: "pointer" }}>
                        {isOpen ? "▲" : "▼"}
                      </button>
                      {modalCanEdit && (
                        <button onClick={() => removeSubtask(s.id)} style={{ fontSize: "12px", color: "#B4B2A9", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}>
                          ✕
                        </button>
                      )}
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: "8px", paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <select
                          value={s.assignee || ""}
                          onChange={(e) => updateSubtaskField(s.id, "assignee", e.target.value || null)}
                          disabled={!modalCanEdit}
                          title="Subtask ini ditugaskan ke"
                          style={{ fontSize: "12.5px", padding: "6px 8px", borderRadius: "5px", border: "1px solid #D8D6CC", background: "#fff" }}
                        >
                          <option value="">👤 Belum ditugaskan</option>
                          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === currentUserId ? " (saya)" : ""}</option>)}
                        </select>
                        <input
                          value={s.link || ""}
                          onChange={(e) => updateSubtaskField(s.id, "link", e.target.value)}
                          disabled={!subtaskWorkable(s)}
                          placeholder="Link (mis. Google Drive, dokumen, dsb)"
                          style={{ fontSize: "12.5px", padding: "6px 8px", borderRadius: "5px", border: "1px solid #D8D6CC" }}
                        />
                        <textarea
                          value={s.note || ""}
                          onChange={(e) => updateSubtaskField(s.id, "note", e.target.value)}
                          disabled={!subtaskWorkable(s)}
                          placeholder="Catatan pekerjaan yang sudah dilakukan"
                          rows={2}
                          style={{ fontSize: "12.5px", padding: "6px 8px", borderRadius: "5px", border: "1px solid #D8D6CC", resize: "vertical", fontFamily: "inherit" }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          {subtaskWorkable(s) && (
                            <label style={{ fontSize: "12px", padding: "5px 10px", border: "1px solid #D8D6CC", borderRadius: "5px", cursor: "pointer", background: "#fff" }}>
                              📎 {s.file ? "Ganti file" : "Upload file"}
                              <input
                                type="file"
                                onChange={(e) => handleSubtaskFile(s.id, e.target.files[0])}
                                style={{ display: "none" }}
                              />
                            </label>
                          )}
                          {s.file && (
                            <span style={{ fontSize: "12px", color: "#5F5E5A", display: "flex", alignItems: "center", gap: "5px" }}>
                              <a href="#" onClick={(e) => { e.preventDefault(); openAttachment(s.file); }} style={{ color: "#3D6FA6", textDecoration: "none" }}>{s.file.name}</a>
                              {subtaskWorkable(s) && (
                                <button onClick={() => removeSubtaskFile(s.id)} style={{ fontSize: "11px", color: "#B4B2A9", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                              )}
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
              {modalCanEdit && <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
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
              </div>}
            </div>
            {(() => {
              // Export memakai versi yang sudah tersimpan, jadi hanya muncul untuk tugas yang statusnya sudah Selesai.
              const saved = !editing.isNew && tasks.find((t) => t.id === editing.id);
              if (!saved || saved.column !== "done") return null;
              return (
                <button
                  onClick={() => exportTasks([saved])}
                  disabled={exporting}
                  style={{ width: "100%", fontSize: "12.5px", fontWeight: 600, padding: "7px 10px", borderRadius: "6px", border: "1px solid #0E7C7B", background: "#E4F3F1", color: "#0E7C7B", cursor: "pointer", marginBottom: "10px", opacity: exporting ? 0.6 : 1 }}
                >
                  {exporting ? "Menyiapkan…" : "⬇ Export tugas ini ke Excel"}
                </button>
              );
            })()}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {savedEditing && canDeleteTask(savedEditing) ? (
                <button onClick={() => deleteTask(editing.id)} style={{ fontSize: "12px", color: "#B4453F", background: "none", border: "none", cursor: "pointer" }}>
                  Hapus
                </button>
              ) : <span />}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setModalOpen(false)} style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "6px", border: "1px solid #D8D6CC", background: "#fff", cursor: "pointer" }}>
                  {modalCanEdit || modalHasOwnSubtasks ? "Batal" : "Tutup"}
                </button>
                {(modalCanEdit || modalHasOwnSubtasks) && (
                  <button onClick={saveTask} style={{ fontSize: "13px", fontWeight: 600, padding: "7px 14px", borderRadius: "6px", border: "none", background: "#232220", color: "#fff", cursor: "pointer" }}>
                    Simpan
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
