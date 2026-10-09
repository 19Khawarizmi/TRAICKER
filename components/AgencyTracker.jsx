"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/trackerData";
import { exportDoneTasks } from "@/lib/exportTasks";
import Icon from "@/components/icons";
import { Splash } from "@/components/AuthGate";
import { useTheme } from "@/components/theme";
import TeamDialog from "@/components/TeamDialog";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import NotificationBell from "@/components/NotificationBell";
import TaskFeed from "@/components/TaskFeed";
import CalendarView from "@/components/CalendarView";
import TimelineView from "@/components/TimelineView";

const COLUMNS = [
  { id: "todo", label: "Perlu Dikerjakan", color: "var(--s-todo)", dot: "" },
  { id: "progress", label: "Sedang Berjalan", color: "var(--s-progress)", dot: "is-half" },
  { id: "ongoing", label: "Ongoing", sub: "s/d event selesai", color: "var(--s-ongoing)", dot: "is-half" },
  { id: "review", label: "Review", color: "var(--s-review)", dot: "is-half" },
  { id: "done", label: "Selesai", color: "var(--s-done)", dot: "is-filled" },
];
const COLUMN_BY_ID = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));

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

const CLIENT_COLORS = ["#0E7C7B", "#3D6FA6", "#8B6A3F", "#5A7D3A", "#C97A1A", "#5B4EA8", "#B4453F", "#6B6A64", "#2F7D9B", "#A0457E"];

// Warna latar lembut untuk klien: campuran warna utama dengan putih (88% putih).
function tintOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.88).toString(16).padStart(2, "0");
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`.toUpperCase();
}

function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 24) || "klien";
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
      className="avatar"
      title={`${profile.name} (${profile.email})`}
      style={{ width: size, height: size, background: avatarColor(profile.id), fontSize: Math.round(size * 0.42) }}
    >
      {initials(profile.name)}
    </span>
  );
}

function StatusDot({ column }) {
  const col = COLUMN_BY_ID[column] || COLUMNS[0];
  return <span className={`status-dot ${col.dot}`} style={{ color: col.color }} />;
}

function Priority({ level }) {
  return (
    <span className={`prio is-${level}`} title={`Prioritas ${level.toLowerCase()}`}>
      <i />
      <i />
      <i />
    </span>
  );
}

// Label tenggat: merah kalau lewat, kuning kalau hari ini/besok.
function DueChip({ task, todayStr }) {
  if (task.column === "ongoing") return <span className="meta-icon"><Icon name="loop" size={13} /></span>;
  if (!task.due) return null;
  const late = isOverdue(task.due, task.column, todayStr);
  const d = todayStr ? daysUntil(task.due, todayStr) : 99;
  const soon = !late && task.column !== "done" && d >= 0 && d <= 1;
  const cls = task.column === "done" ? "is-done" : late ? "is-late" : soon ? "is-soon" : "";
  const label = soon ? (d === 0 ? "Hari ini" : "Besok") : fmtDate(task.due);
  return (
    <span className={`due ${cls}`} title={late ? `Lewat ${-d} hari` : undefined}>
      <Icon name="calendar" size={12} />
      {label}
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
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", short: "", color: CLIENT_COLORS[0] });
  const [clientError, setClientError] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const { theme, resolved: resolvedTheme, setTheme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [todayStr, setTodayStr] = useState("");
  const notifiedRef = useRef(false);
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [view, setView] = useState("board"); // board | calendar | timeline
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
    try {
      const saved = localStorage.getItem("traicker:view");
      if (saved === "calendar" || saved === "timeline") setView(saved);
    } catch {}
  }, []);

  function changeView(next) {
    setView(next);
    try {
      localStorage.setItem("traicker:view", next);
    } catch {}
  }

  // Realtime: perubahan dari anggota lain (tugas, subtask, klien, anggota) langsung memuat ulang papan.
  // Ditunda sebentar supaya banyak perubahan beruntun cukup dimuat sekali, dan tidak memotong drag yang sedang berjalan.
  const dragIdRef = useRef(null);
  dragIdRef.current = dragId;
  useEffect(() => {
    let timer;
    const run = () => {
      if (dragIdRef.current) {
        timer = setTimeout(run, 500);
        return;
      }
      loadBoard();
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 400);
    };
    const channel = supabase
      .channel("board-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "subtasks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, schedule)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Klien yang diarsipkan disembunyikan dari sidebar, pilihan klien, dan board (datanya tetap ada).
  const activeClients = clients.filter((c) => !c.archived);
  const archivedClientIds = new Set(clients.filter((c) => c.archived).map((c) => c.id));
  const boardTasks = tasks.filter((t) => !archivedClientIds.has(t.client));
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

  const visibleTasks = boardTasks
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

  const counts = activeClients.reduce((acc, c) => {
    acc[c.id] = boardTasks.filter((t) => t.client === c.id && t.column !== "done").length;
    return acc;
  }, {});
  const overdueCount = boardTasks.filter((t) => isOverdue(t.due, t.column, todayStr)).length;
  const dueSoon = boardTasks.filter((t) => t.column !== "done" && t.column !== "ongoing" && t.due && daysUntil(t.due, todayStr) >= 0 && daysUntil(t.due, todayStr) <= 1).sort((a, b) => (a.due < b.due ? -1 : 1));
  const overdueTasks = boardTasks.filter((t) => isOverdue(t.due, t.column, todayStr)).sort((a, b) => (a.due < b.due ? -1 : 1));

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

  // ---- Kelola klien (admin) ----
  function openClientModal() {
    setNewClient({ name: "", short: "", color: CLIENT_COLORS[clients.length % CLIENT_COLORS.length] });
    setClientError("");
    setClientModalOpen(true);
  }

  function addClient() {
    const name = newClient.name.trim();
    if (!name) return;
    if (clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setClientError("Klien dengan nama ini sudah ada.");
      return;
    }
    const base = slugify(name);
    let id = base;
    for (let i = 2; clients.some((c) => c.id === id); i++) id = `${base}${i}`;
    const client = {
      id,
      name,
      short: newClient.short.trim() || name.slice(0, 14),
      color: newClient.color,
      tint: tintOf(newClient.color),
      sortOrder: clients.reduce((max, c) => Math.max(max, c.sortOrder || 0), 0) + 1,
      archived: false,
    };
    setClients((prev) => [...prev, client]);
    setNewClient({ name: "", short: "", color: CLIENT_COLORS[(clients.length + 1) % CLIENT_COLORS.length] });
    setClientError("");
    persist(() => db.createClientRow(client));
  }

  function setArchived(client, archived) {
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, archived } : c)));
    if (archived && activeClient === client.id) setActiveClient("all");
    persist(() => db.setClientArchived(client.id, archived));
  }

  function removeClient(client) {
    const used = tasks.filter((t) => t.client === client.id).length;
    if (used > 0) {
      setClientError(`"${client.name}" masih punya ${used} tugas. Arsipkan saja, atau pindahkan/hapus tugasnya dulu.`);
      return;
    }
    if (!window.confirm(`Hapus klien "${client.name}" secara permanen?`)) return;
    setClients((prev) => prev.filter((c) => c.id !== client.id));
    if (activeClient === client.id) setActiveClient("all");
    setClientError("");
    persist(() => db.deleteClientRow(client.id));
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
    setEditing({ id: crypto.randomUUID(), isNew: true, title: "", client: activeClients[0]?.id, assignee: isAdmin ? null : currentUserId, createdBy: currentUserId, priority: "Sedang", due: todayStr, start: "", column: "todo", subtasks: [] });
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

  // Dari notifikasi: buka detail tugas berdasarkan id (kalau masih ada).
  function openTaskById(id) {
    const task = tasks.find((t) => t.id === id);
    if (task) openEdit(task);
  }

  // Dari kalender: geser tugas ke tanggal lain = ganti deadline.
  function moveDue(task, due) {
    if (!canEditTask(task)) return;
    const start = task.start && task.start > due ? due : task.start;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due, start } : t)));
    persist(() => db.updateTaskDates(task.id, { due, start }));
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
  const datesInvalid = !!editing && editing.column !== "ongoing" && !!editing.start && !!editing.due && editing.start > editing.due;

  // Esc menutup panel / dialog / popover yang sedang terbuka.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (attentionOpen) setAttentionOpen(false);
      else if (userMenuOpen) setUserMenuOpen(false);
      else if (passwordOpen) setPasswordOpen(false);
      else if (teamOpen) setTeamOpen(false);
      else if (clientModalOpen) setClientModalOpen(false);
      else if (modalOpen) setModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attentionOpen, userMenuOpen, passwordOpen, teamOpen, clientModalOpen, modalOpen]);

  if (!loaded) return <Splash label="Menyiapkan papan…" />;

  if (loadError) {
    return (
      <div className="splash">
        <div className="auth-error" style={{ maxWidth: 360 }}>
          <Icon name="alert" size={14} />
          <span>Gagal memuat data: {loadError}</span>
        </div>
        <button className="btn btn-secondary" onClick={loadBoard}>Coba lagi</button>
      </div>
    );
  }

  const viewClient = activeClient === "all" ? null : clientOf(activeClient);
  const doneCount = visibleTasks.filter((t) => t.column === "done").length;
  const attentionCount = overdueTasks.length + dueSoon.length;
  const saveLabel =
    saveState === "saving" ? "Menyimpan…"
    : saveState === "saved" ? "Tersimpan"
    : saveState === "error" ? (saveError.includes("akses") || saveError.includes("hanya boleh") ? saveError : "Gagal menyimpan")
    : "";
  const profileOptions = profiles.map((p) => (
    <option key={p.id} value={p.id}>{p.name}{p.id === currentUserId ? " (saya)" : ""}</option>
  ));

  return (
    <div className="app">
      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">Ai</div>
          <div className="brand-name">Tr<em>ai</em>cker</div>
        </div>

        <nav>
          <button className={`nav-item ${activeClient === "all" ? "is-active" : ""}`} onClick={() => setActiveClient("all")}>
            <Icon name="folder" size={15} />
            <span className="nav-text">Semua klien</span>
            <span className="nav-count">{boardTasks.filter((t) => t.column !== "done").length}</span>
          </button>
          <div className="nav-label">Klien</div>
          {activeClients.map((c) => (
            <button key={c.id} className={`nav-item ${activeClient === c.id ? "is-active" : ""}`} onClick={() => setActiveClient(c.id)} title={c.name}>
              <span className="dot" style={{ background: c.color }} />
              <span className="nav-text">{c.short}</span>
              <span className="nav-count">{counts[c.id] || ""}</span>
            </button>
          ))}
        </nav>

        {isAdmin && (
          <div className="sidebar-foot">
            <button className="nav-item" onClick={() => setTeamOpen(true)}>
              <Icon name="users" size={15} />
              <span className="nav-text">Anggota tim</span>
              <span className="nav-count">{profiles.length}</span>
            </button>
            <button className="nav-item" onClick={openClientModal}>
              <Icon name="settings" size={15} />
              <span className="nav-text">Kelola klien</span>
              {archivedClientIds.size > 0 && <span className="nav-count">{archivedClientIds.size} arsip</span>}
            </button>
          </div>
        )}
      </aside>

      <div className="main">
        {/* ---------- Topbar ---------- */}
        <header className="topbar">
          <label className="search">
            <Icon name="search" size={14} />
            <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari tugas…" aria-label="Cari tugas" />
          </label>
          <div className="topbar-spacer" />
          {saveLabel && (
            <span key={saveState + saveError} className={`save-status ${saveState === "error" ? "is-error" : ""}`} title={saveError}>
              {saveState === "saving" ? <span className="spinner" /> : saveState === "saved" ? <Icon name="check" size={13} /> : <Icon name="alert" size={13} />}
              {saveLabel}
            </span>
          )}
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" size={14} />
            Tugas baru
          </button>

          <NotificationBell userId={currentUserId} profileOf={profileOf} Avatar={Avatar} onOpenTask={openTaskById} />

          <button
            className="btn btn-ghost btn-icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            title={resolvedTheme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
            aria-label="Ganti tema"
          >
            <Icon name={resolvedTheme === "dark" ? "sun" : "moon"} />
          </button>

          {/* Akun yang sedang login */}
          <div className="attention">
            <button className="user-chip" onClick={() => setUserMenuOpen((o) => !o)} title={me ? `Login sebagai ${me.email}` : "Akun"}>
              {me ? <Avatar profile={me} size={30} /> : <span className="avatar" style={{ width: 30, height: 30, background: "var(--sunken)" }} />}
              <span className="user-chip-text">
                <span className="user-chip-name">{me?.name || "Akun"}</span>
                <span className={`user-chip-role ${isAdmin ? "is-admin" : ""}`}>{isAdmin ? "Admin" : "Member"}</span>
              </span>
              <Icon name="chevronDown" size={14} style={{ color: "var(--muted)" }} />
            </button>
            {userMenuOpen && (
              <>
                <div className="popover-scrim" onClick={() => setUserMenuOpen(false)} />
                <div className="popover align-right account">
                  <div className="account-head">
                    {me && <Avatar profile={me} size={40} />}
                    <div style={{ minWidth: 0 }}>
                      <div className="account-name">{me?.name}</div>
                      <div className="account-email">{me?.email}</div>
                      <span className={`role-badge ${isAdmin ? "is-admin" : ""}`}>{isAdmin ? "Admin" : "Member"}</span>
                    </div>
                  </div>
                  <div className="popover-label" style={{ paddingTop: 4 }}>Tampilan</div>
                  <div className="segmented" role="radiogroup" aria-label="Tema">
                    {[
                      { id: "light", label: "Terang", icon: "sun" },
                      { id: "dark", label: "Gelap", icon: "moon" },
                      { id: "system", label: "Sistem", icon: "monitor" },
                    ].map((o) => (
                      <button key={o.id} role="radio" aria-checked={theme === o.id} className={theme === o.id ? "is-active" : ""} onClick={() => setTheme(o.id)}>
                        <Icon name={o.icon} size={13} />
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button className="popover-item" onClick={() => { setUserMenuOpen(false); setPasswordOpen(true); }}>
                    <Icon name="lock" size={15} />
                    <span className="grow">Ganti password</span>
                  </button>
                  <button className="popover-item" onClick={() => { setUserMenuOpen(false); supabase.auth.signOut(); }} style={{ color: "var(--danger)" }}>
                    <Icon name="logout" size={15} />
                    <span className="grow">Keluar</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* ---------- Judul + filter ---------- */}
        <section className="page-head">
          <div>
            <h1 className="page-title">
              {viewClient ? viewClient.name : <>Semua <em>klien</em></>}
            </h1>
            <div className="page-meta">
              <span className="mono">{visibleTasks.length}</span> tugas
              <span className="sep">·</span>
              <span className="mono">{doneCount}</span> selesai
              <span className="sep">·</span>
              <span className="attention">
                {attentionCount === 0 ? (
                  <span className="attention-btn is-ok"><Icon name="check" size={12} /> Semua on track</span>
                ) : (
                  <button className={`attention-btn ${overdueTasks.length ? "is-danger" : "is-warn"}`} onClick={() => setAttentionOpen((o) => !o)}>
                    <span className="pulse" />
                    {overdueTasks.length > 0 ? `${overdueTasks.length} lewat tenggat` : `${dueSoon.length} jatuh tempo`}
                    {overdueTasks.length > 0 && dueSoon.length > 0 && ` · ${dueSoon.length} segera`}
                    <Icon name="chevronDown" size={12} />
                  </button>
                )}
                {attentionOpen && (
                  <>
                    <div className="popover-scrim" onClick={() => setAttentionOpen(false)} />
                    <div className="popover attention-list">
                      {overdueTasks.length > 0 && <div className="popover-label">Lewat tenggat</div>}
                      {overdueTasks.map((t) => (
                        <button key={t.id} className="popover-item" onClick={() => { setAttentionOpen(false); openEdit(t); }}>
                          <span className="dot" style={{ background: clientOf(t.client).color }} />
                          <span className="grow">{t.title}</span>
                          <span className="tag-late">{-daysUntil(t.due, todayStr)} hari</span>
                        </button>
                      ))}
                      {dueSoon.length > 0 && <div className="popover-label">Segera</div>}
                      {dueSoon.map((t) => (
                        <button key={t.id} className="popover-item" onClick={() => { setAttentionOpen(false); openEdit(t); }}>
                          <span className="dot" style={{ background: clientOf(t.client).color }} />
                          <span className="grow">{t.title}</span>
                          <span className="tag-soon">{daysUntil(t.due, todayStr) === 0 ? "hari ini" : "besok"}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="toolbar">
            <div className="segmented view-switch" role="tablist" aria-label="Tampilan">
              {[
                ["board", "Papan", "columns"],
                ["calendar", "Kalender", "calendar"],
                ["timeline", "Timeline", "timeline"],
              ].map(([id, label, icon]) => (
                <button key={id} role="tab" aria-selected={view === id} className={view === id ? "is-active" : ""} onClick={() => changeView(id)}>
                  <Icon name={icon} size={13} />
                  {label}
                </button>
              ))}
            </div>
            <select
              className={`select ${assigneeFilter !== "all" ? "is-active" : ""}`}
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              aria-label="Filter orang"
            >
              <option value="all">Semua orang</option>
              <option value="me">Tugas saya</option>
              <option value="none">Belum ditugaskan</option>
              {profileOptions}
            </select>
            {view === "board" && (
            <select className={`select ${sortBy !== "default" ? "is-active" : ""}`} value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Urutan">
              <option value="default">Urutan manual</option>
              <option value="due">Deadline terdekat</option>
              <option value="client">Nama klien</option>
            </select>
            )}
          </div>
        </section>

        {view === "calendar" && (
          <CalendarView tasks={visibleTasks} todayStr={todayStr} clientOf={clientOf} isOverdue={isOverdue} canEditTask={canEditTask} onOpen={openEdit} onMoveDue={moveDue} />
        )}
        {view === "timeline" && (
          <TimelineView
            tasks={visibleTasks}
            todayStr={todayStr}
            clientOf={clientOf}
            isOverdue={isOverdue}
            onOpen={openEdit}
            columns={Object.fromEntries(COLUMNS.map((c) => [c.id, c.label]))}
          />
        )}

        {/* ---------- Board ---------- */}
        {view === "board" && (
        <div className="board">
          {COLUMNS.map((col) => {
            const colTasks = visibleTasks.filter((t) => t.column === col.id);
            const isDone = col.id === "done";
            const isDropColumn = dragId && dropTarget?.column === col.id;
            const selectedDone = isDone ? colTasks.filter((t) => selectedIds.has(t.id)) : [];
            const allSelected = isDone && colTasks.length > 0 && selectedDone.length === colTasks.length;
            return (
              <section
                key={col.id}
                className={`column ${col.id === "ongoing" ? "is-ongoing" : ""} ${isDropColumn ? "is-drop" : ""}`}
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
              >
                <header className="column-head">
                  {isDone && colTasks.length > 0 ? (
                    <input
                      type="checkbox"
                      className="check is-done"
                      checked={allSelected}
                      onChange={() => setSelectedIds(allSelected ? new Set() : new Set(colTasks.map((t) => t.id)))}
                      title={allSelected ? "Batal pilih semua" : "Pilih semua untuk export"}
                    />
                  ) : (
                    <StatusDot column={col.id} />
                  )}
                  <span className="column-title">
                    {col.label} {col.sub && <span className="column-sub">· {col.sub}</span>}
                  </span>
                  <span className="column-count">{colTasks.length}</span>
                </header>

                {isDone && colTasks.length > 0 && (
                  <div className="column-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => exportTasks(selectedDone.length > 0 ? selectedDone : colTasks)} disabled={exporting} title="Download Excel">
                      {exporting ? <span className="spinner" /> : <Icon name="download" size={13} />}
                      {exporting ? "Menyiapkan…" : selectedDone.length > 0 ? `Export ${selectedDone.length} terpilih` : `Export semua`}
                    </button>
                    {selectedDone.length > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())} style={{ flex: "0 0 auto" }}>
                        Batal
                      </button>
                    )}
                  </div>
                )}

                <div className="column-body">
                  {colTasks.map((t, i) => {
                    const c = clientOf(t.client);
                    const nextId = colTasks[i + 1]?.id || null;
                    const showLineBefore = isDropColumn && canReorder && dropTarget.beforeId === t.id && dragId !== t.id;
                    const draggable = canEditTask(t);
                    const subs = t.subtasks || [];
                    const doneCt = subs.filter((s) => s.done).length;
                    const attachCt = subs.filter((s) => s.file || s.link).length;
                    const people = peopleOf(t);
                    const selected = isDone && selectedIds.has(t.id);
                    return (
                      <React.Fragment key={t.id}>
                        {showLineBefore && <div className="drop-line" />}
                        <article
                          className={`card ${draggable ? "is-draggable" : ""} ${dragId === t.id ? "is-dragging" : ""} ${selected ? "is-selected" : ""} ${isDone ? "is-done" : ""}`}
                          draggable={draggable}
                          title={draggable ? undefined : "Hanya admin atau orang yang ditugaskan yang bisa memindahkan tugas ini"}
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
                          style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
                        >
                          <div className="card-top">
                            <span className="client-tag">
                              <span className="dot" style={{ background: c.color, width: 7, height: 7 }} />
                              <span>{c.short}</span>
                            </span>
                            {isDone && (
                              <input
                                type="checkbox"
                                className="check is-done card-select"
                                checked={selectedIds.has(t.id)}
                                onChange={() => toggleSelected(t.id)}
                                onClick={(e) => e.stopPropagation()}
                                title="Pilih untuk export"
                              />
                            )}
                          </div>

                          <div className="card-title">{t.title}</div>

                          {subs.length > 0 && (
                            <div className="progress">
                              <div className="progress-track">
                                <div className="progress-fill" style={{ width: `${Math.round((doneCt / subs.length) * 100)}%`, background: doneCt === subs.length ? "var(--ok)" : c.color }} />
                              </div>
                              <span className="progress-label">{doneCt}/{subs.length}</span>
                            </div>
                          )}

                          <div className="card-foot">
                            <DueChip task={t} todayStr={todayStr} />
                            <Priority level={t.priority} />
                            {attachCt > 0 && (
                              <span className="meta-icon" title={`${attachCt} lampiran/link`}>
                                <Icon name="clip" size={12} />
                                {attachCt}
                              </span>
                            )}
                            <span className="grow" />
                            {people.length > 0 && (
                              <span className="avatar-stack">
                                {people.slice(0, 3).map((p) => <Avatar key={p.id} profile={p} size={22} />)}
                                {people.length > 3 && <span className="avatar-more">+{people.length - 3}</span>}
                              </span>
                            )}
                          </div>
                        </article>
                      </React.Fragment>
                    );
                  })}
                  {isDropColumn && (dropTarget.beforeId === null || !canReorder) && colTasks.length > 0 && <div className="drop-line" />}
                  {colTasks.length === 0 && <div className="empty-col">{isDropColumn ? "Lepas di sini" : "Belum ada tugas"}</div>}
                </div>
              </section>
            );
          })}
        </div>
        )}
      </div>

      {passwordOpen && me && <ChangePasswordDialog email={me.email} onClose={() => setPasswordOpen(false)} />}

      {/* ---------- Anggota tim (admin) ---------- */}
      {teamOpen && isAdmin && (
        <TeamDialog
          profiles={profiles}
          currentUserId={currentUserId}
          Avatar={Avatar}
          onClose={() => setTeamOpen(false)}
          onCreated={(p) => setProfiles((prev) => [...prev.filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)))}
          onUpdated={(p) => setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)).sort((a, b) => a.name.localeCompare(b.name)))}
          onRemoved={(id) => {
            // Database mengosongkan penugasan orang ini (on delete set null); samakan tampilan tanpa reload.
            setProfiles((prev) => prev.filter((x) => x.id !== id));
            setTasks((prev) =>
              prev.map((t) => ({
                ...t,
                assignee: t.assignee === id ? null : t.assignee,
                createdBy: t.createdBy === id ? null : t.createdBy,
                subtasks: (t.subtasks || []).map((s) => (s.assignee === id ? { ...s, assignee: null } : s)),
              }))
            );
            if (assigneeFilter === id) setAssigneeFilter("all");
          }}
        />
      )}

      {/* ---------- Kelola klien (admin) ---------- */}
      {clientModalOpen && isAdmin && (
        <>
          <div className="scrim" onClick={() => setClientModalOpen(false)} />
          <div className="dialog-wrap">
            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="client-dialog-title">
              <div className="dialog-head">
                <div style={{ flex: 1 }}>
                  <h2 id="client-dialog-title" className="dialog-title">Kelola klien</h2>
                  <p className="dialog-sub">Tambah klien baru, arsipkan yang sudah selesai, atau hapus yang tidak dipakai.</p>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setClientModalOpen(false)} aria-label="Tutup">
                  <Icon name="x" />
                </button>
              </div>

              <div className="dialog-body">
                <div className="panel">
                  <div className="form-grid">
                    <input
                      className="field"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") addClient(); }}
                      placeholder="Nama klien"
                      autoFocus
                    />
                    <input
                      className="field"
                      value={newClient.short}
                      onChange={(e) => setNewClient({ ...newClient, short: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") addClient(); }}
                      placeholder="Label pendek"
                      maxLength={20}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
                    <div className="swatches">
                      {CLIENT_COLORS.map((col) => (
                        <button
                          key={col}
                          className={`swatch ${newClient.color === col ? "is-active" : ""}`}
                          style={{ background: col }}
                          onClick={() => setNewClient({ ...newClient, color: col })}
                          aria-label={`Warna ${col}`}
                        />
                      ))}
                    </div>
                    <div style={{ flex: 1 }} />
                    {newClient.name.trim() && (
                      <span className="chip" style={{ background: `color-mix(in srgb, ${newClient.color} 16%, transparent)`, color: newClient.color }}>
                        {newClient.short.trim() || newClient.name.trim().slice(0, 14)}
                      </span>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={addClient} disabled={!newClient.name.trim()}>
                      <Icon name="plus" size={13} />
                      Tambah
                    </button>
                  </div>
                </div>

                {clientError && (
                  <div className="auth-error" style={{ marginTop: 12 }}>
                    <Icon name="alert" size={14} />
                    <span>{clientError}</span>
                  </div>
                )}

                {[
                  { label: "Aktif", list: activeClients },
                  { label: "Arsip", list: clients.filter((c) => c.archived) },
                ].map(({ label, list }) => list.length > 0 && (
                  <div key={label}>
                    <div className="list-label">
                      <span>{label}</span>
                      <span className="mono">{list.length}</span>
                    </div>
                    {list.map((c) => {
                      const taskCount = tasks.filter((t) => t.client === c.id).length;
                      return (
                        <div key={c.id} className={`client-row ${c.archived ? "is-archived" : ""}`}>
                          <span className="dot" style={{ background: c.color, width: 10, height: 10 }} />
                          <div className="info">
                            <div className="name">{c.name}</div>
                            <div className="sub">{c.short} · <span className="mono">{taskCount}</span> tugas</div>
                          </div>
                          <button className="btn btn-ghost btn-sm" onClick={() => setArchived(c, !c.archived)}>
                            <Icon name={c.archived ? "restore" : "archive"} size={13} />
                            {c.archived ? "Pulihkan" : "Arsipkan"}
                          </button>
                          <button
                            className="btn btn-danger-ghost btn-icon"
                            onClick={() => removeClient(c)}
                            title={taskCount > 0 ? "Masih punya tugas — arsipkan saja" : "Hapus permanen"}
                            style={{ opacity: taskCount > 0 ? 0.4 : 1 }}
                            aria-label={`Hapus ${c.name}`}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}

                <p className="text-muted" style={{ marginTop: 18, lineHeight: 1.5 }}>
                  Klien yang diarsipkan beserta tugasnya disembunyikan dari papan, tapi datanya tetap tersimpan dan bisa dipulihkan. Hapus permanen hanya untuk klien tanpa tugas.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---------- Panel detail tugas ---------- */}
      {modalOpen && editing && (
        <>
          <div className="scrim" onClick={() => setModalOpen(false)} />
          <aside className="drawer" role="dialog" aria-modal="true" aria-label={editing.isNew ? "Tugas baru" : "Detail tugas"}>
            <div className="drawer-head">
              <div className="crumbs">
                <span className="dot" style={{ background: clientOf(editing.client).color }} />
                <strong>{clientOf(editing.client).name || "Klien"}</strong>
                <Icon name="chevronRight" size={13} />
                <span>{editing.isNew ? "Tugas baru" : COLUMN_BY_ID[editing.column]?.label}</span>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModalOpen(false)} aria-label="Tutup">
                <Icon name="x" />
              </button>
            </div>

            <div className="drawer-body">
              {!modalCanEdit && (
                <div className="notice">
                  <Icon name="lock" size={14} />
                  <span>
                    {modalHasOwnSubtasks
                      ? "Tugas ini bukan milikmu. Kamu bisa mengubah status, link, catatan, dan lampiran di subtask yang ditugaskan ke kamu."
                      : "Hanya bisa dilihat. Yang bisa mengubah tugas ini: admin dan orang yang ditugaskan."}
                  </span>
                </div>
              )}

              <textarea
                className="title-input"
                rows={1}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                disabled={!modalCanEdit}
                placeholder="Judul tugas"
                autoFocus={editing.isNew}
              />

              <div className="props">
                <div className="prop-label"><Icon name="status" size={14} />Status</div>
                <div className="prop-value">
                  <StatusDot column={editing.column} />
                  <select
                    className="field"
                    value={editing.column}
                    onChange={(e) => {
                      const col = e.target.value;
                      setEditing({ ...editing, column: col, due: col === "ongoing" ? "" : (editing.due || todayStr) });
                    }}
                    disabled={!modalCanEdit}
                  >
                    {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}{c.sub ? ` (${c.sub})` : ""}</option>)}
                  </select>
                </div>

                <div className="prop-label"><Icon name="folder" size={14} />Klien</div>
                <div className="prop-value">
                  <span className="dot" style={{ background: clientOf(editing.client).color }} />
                  <select className="field" value={editing.client} onChange={(e) => setEditing({ ...editing, client: e.target.value })} disabled={!modalCanEdit}>
                    {clients.filter((c) => !c.archived || c.id === editing.client).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.archived ? " (diarsipkan)" : ""}</option>
                    ))}
                  </select>
                </div>

                <div className="prop-label"><Icon name="user" size={14} />Ditugaskan</div>
                <div className="prop-value">
                  {profileOf(editing.assignee) ? <Avatar profile={profileOf(editing.assignee)} size={22} /> : <span className="avatar" style={{ width: 22, height: 22, background: "var(--sunken)", color: "var(--faint)" }}><Icon name="user" size={12} /></span>}
                  <select
                    className="field"
                    value={editing.assignee || ""}
                    onChange={(e) => setEditing({ ...editing, assignee: e.target.value || null })}
                    disabled={!isAdmin}
                    title={isAdmin ? "Ditugaskan ke" : "Hanya admin yang bisa mengubah penugasan"}
                  >
                    <option value="">Belum ditugaskan</option>
                    {profileOptions}
                  </select>
                </div>

                <div className="prop-label"><Icon name="flag" size={14} />Prioritas</div>
                <div className="prop-value">
                  <Priority level={editing.priority} />
                  <select className="field" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })} disabled={!modalCanEdit}>
                    {Object.keys(PRIORITIES).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="prop-label"><Icon name="calendar" size={14} />Mulai</div>
                <div className="prop-value">
                  {editing.column === "ongoing" ? (
                    <span className="text-muted" style={{ fontSize: 12.5 }}>—</span>
                  ) : (
                    <input type="date" className="field mono" value={editing.start || ""} max={editing.due || undefined} onChange={(e) => setEditing({ ...editing, start: e.target.value })} disabled={!modalCanEdit} />
                  )}
                </div>

                <div className="prop-label"><Icon name="calendar" size={14} />Deadline</div>
                <div className="prop-value">
                  {editing.column === "ongoing" ? (
                    <span className="text-muted" style={{ fontSize: 12.5 }}>Tanpa tanggal — aktif sampai dipindahkan</span>
                  ) : (
                    <input type="date" className="field mono" value={editing.due} onChange={(e) => setEditing({ ...editing, due: e.target.value })} disabled={!modalCanEdit} />
                  )}
                </div>
                {datesInvalid && <div className="prop-hint" style={{ color: "var(--danger)" }}>Tanggal mulai harus sebelum atau sama dengan deadline.</div>}
              </div>

              {/* Subtask */}
              {(() => {
                const subs = editing.subtasks || [];
                const doneCt = subs.filter((s) => s.done).length;
                return (
                  <>
                    <div className="section-head">
                      <span className="section-title">Subtask</span>
                      <span className="progress-label">{doneCt}/{subs.length}</span>
                      {subs.length > 0 && (
                        <div className="progress">
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width: `${Math.round((doneCt / subs.length) * 100)}%`, background: doneCt === subs.length ? "var(--ok)" : "var(--ink)" }} />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="subtasks">
                      {subs.length === 0 && <div className="subtask-empty">Pecah tugas ini jadi langkah-langkah kecil.</div>}
                      {subs.map((s) => {
                        const isOpen = expandedSubtask === s.id;
                        const workable = subtaskWorkable(s);
                        const hasExtra = s.link || s.note || s.file;
                        return (
                          <div key={s.id} className={`subtask ${s.done ? "is-done" : ""}`}>
                            <div className="subtask-row">
                              <input type="checkbox" className="check check-round is-done" checked={s.done} onChange={() => toggleSubtask(s.id)} disabled={!workable} />
                              <span className="subtask-text" onClick={() => setExpandedSubtask(isOpen ? null : s.id)}>{s.text}</span>
                              {hasExtra && <span className="meta-icon"><Icon name="clip" size={12} /></span>}
                              <Avatar profile={profileOf(s.assignee)} size={20} />
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setExpandedSubtask(isOpen ? null : s.id)} aria-label="Detail subtask">
                                <Icon name="chevronDown" size={14} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                              </button>
                              {modalCanEdit && (
                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeSubtask(s.id)} aria-label="Hapus subtask" style={{ color: "var(--faint)" }}>
                                  <Icon name="x" size={14} />
                                </button>
                              )}
                            </div>
                            {isOpen && (
                              <div className="subtask-more">
                                <div className="row">
                                  <Icon name="user" size={14} />
                                  <select className="field" value={s.assignee || ""} onChange={(e) => updateSubtaskField(s.id, "assignee", e.target.value || null)} disabled={!modalCanEdit}>
                                    <option value="">Belum ditugaskan</option>
                                    {profileOptions}
                                  </select>
                                </div>
                                <div className="row">
                                  <Icon name="link" size={14} />
                                  <input className="field" value={s.link || ""} onChange={(e) => updateSubtaskField(s.id, "link", e.target.value)} disabled={!workable} placeholder="Link Google Drive, Figma, dokumen…" />
                                </div>
                                <div className="row" style={{ alignItems: "flex-start" }}>
                                  <Icon name="note" size={14} style={{ marginTop: 9 }} />
                                  <textarea className="field" value={s.note || ""} onChange={(e) => updateSubtaskField(s.id, "note", e.target.value)} disabled={!workable} placeholder="Catatan pekerjaan yang sudah dilakukan" rows={2} />
                                </div>
                                <div className="row" style={{ flexWrap: "wrap" }}>
                                  <Icon name="clip" size={14} />
                                  {s.file && (
                                    <span className="file-pill">
                                      <a href="#" onClick={(e) => { e.preventDefault(); openAttachment(s.file); }}>{s.file.name}</a>
                                      {workable && (
                                        <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 22, height: 22 }} onClick={() => removeSubtaskFile(s.id)} aria-label="Hapus lampiran">
                                          <Icon name="x" size={12} />
                                        </button>
                                      )}
                                    </span>
                                  )}
                                  {workable && (
                                    <label className="btn btn-secondary btn-sm upload-btn">
                                      {s.file ? "Ganti file" : "Upload file"}
                                      <input type="file" onChange={(e) => handleSubtaskFile(s.id, e.target.files[0])} />
                                    </label>
                                  )}
                                  {!s.file && !workable && <span className="text-muted">Tidak ada lampiran</span>}
                                  {s.fileError && <span className={s.fileError === "Mengupload..." ? "text-muted" : "text-err"}>{s.fileError}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {modalCanEdit && (
                        <div className="add-row">
                          <Icon name="plus" size={14} />
                          <input
                            value={newSubtask}
                            onChange={(e) => setNewSubtask(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                            placeholder="Tambah subtask, lalu tekan Enter"
                          />
                          {newSubtask.trim() && <span className="kbd">Enter</span>}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {!editing.isNew && (
                <TaskFeed
                  key={editing.id}
                  taskId={editing.id}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  profileOf={profileOf}
                  clientOf={(id) => clients.find((c) => c.id === id)}
                  columnLabel={(id) => COLUMN_BY_ID[id]?.label || id}
                  Avatar={Avatar}
                />
              )}
            </div>

            <div className="drawer-foot">
              {savedEditing && canDeleteTask(savedEditing) && (
                <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteTask(editing.id)}>
                  <Icon name="trash" size={13} />
                  Hapus
                </button>
              )}
              {savedEditing && savedEditing.column === "done" && (
                <button className="btn btn-ghost btn-sm" onClick={() => exportTasks([savedEditing])} disabled={exporting}>
                  {exporting ? <span className="spinner" /> : <Icon name="download" size={13} />}
                  Export Excel
                </button>
              )}
              <span className="grow" />
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                {modalCanEdit || modalHasOwnSubtasks ? "Batal" : "Tutup"}
              </button>
              {(modalCanEdit || modalHasOwnSubtasks) && (
                <button className="btn btn-primary" onClick={saveTask} disabled={!editing.title.trim() || datesInvalid}>
                  Simpan
                </button>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
