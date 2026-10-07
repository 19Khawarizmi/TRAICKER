// Export tugas berstatus "done" ke file Excel (.xlsx).
// Sheet: Ringkasan (1 baris per tugas), Detail Subtask (1 baris per subtask), Info Export.
// Data diambil ulang dari Supabase saat export, dan library Excel baru dimuat saat tombol diklik.

import { supabase } from "@/lib/supabase";
import { fetchDoneTasksForExport } from "@/lib/trackerData";

const PRIORITY_ORDER = { Tinggi: 0, Sedang: 1, Rendah: 2 };
const STATUS_LABEL = { todo: "Perlu Dikerjakan", progress: "Sedang Berjalan", ongoing: "Ongoing", review: "Review", done: "Selesai" };
const HEADER = { fontWeight: "bold", backgroundColor: "#232220", textColor: "#FFFFFF", alignVertical: "center" };
const TASK_BAND = "#F1F0EB";

// write-excel-file menghitung tanggal dalam UTC. Supaya yang tampil di Excel sama dengan jam lokal (WIB),
// geser waktu sebesar offset zona waktu.
function asLocalExcelDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
}

function dateCell(ymd, style) {
  if (!ymd) return { value: "-", ...style };
  const [y, m, d] = ymd.split("-").map(Number);
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: "dd/mm/yyyy", ...style };
}

function dateTimeCell(iso, style) {
  if (!iso) return { value: "-", ...style };
  return { value: asLocalExcelDate(new Date(iso)), type: Date, format: "dd/mm/yyyy hh:mm", ...style };
}

// Link bisa diklik lewat formula HYPERLINK; Excel membatasi argumen formula 255 karakter.
function linkCell(url, style) {
  if (!url) return { value: "-", ...style };
  if (url.length > 250 || !/^https?:\/\//i.test(url)) return { value: url, ...style };
  return { value: `HYPERLINK("${url.replace(/"/g, '""')}","${url.replace(/"/g, '""')}")`, type: "Formula", textColor: "#3D6FA6", ...style };
}

function text(value, style) {
  return { value: value === undefined || value === null || value === "" ? "-" : String(value), ...style };
}

function lines(items) {
  return items.length ? items.join("\n") : "-";
}

function deadlineNote(task) {
  if (!task.due) return "Tanpa deadline";
  const finished = new Date(task.updatedAt);
  const due = new Date(task.due + "T23:59:59");
  return finished <= due ? "Tepat waktu" : "Melewati deadline";
}

export async function exportDoneTasks(tasks, clientOf, profileOf = () => null) {
  const personName = (id) => profileOf(id)?.name || "-";
  const ids = tasks.filter((t) => t.column === "done").map((t) => t.id);
  if (ids.length === 0) return;

  const [fresh, { data: userData }] = await Promise.all([fetchDoneTasksForExport(ids), supabase.auth.getUser()]);
  if (fresh.length === 0) throw new Error("Tidak ada tugas berstatus Selesai untuk diexport.");

  const sorted = fresh.sort(
    (a, b) =>
      clientOf(a.client).name.localeCompare(clientOf(b.client).name) ||
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
      a.title.localeCompare(b.title)
  );

  // ---- Sheet 1: Ringkasan ----
  const top = { alignVertical: "top" };
  const wrapTop = { wrap: true, alignVertical: "top" };
  const summaryRows = [
    [
      "No", "Judul Tugas", "Klien", "Ditugaskan ke", "Prioritas", "Status", "Deadline", "Ketepatan", "Dibuat", "Terakhir Diubah",
      "Progress Subtask", "Selesai / Total", "Daftar Subtask", "Link Terkait", "Catatan Pekerjaan", "Lampiran",
    ].map((value) => ({ value, ...HEADER, wrap: true })),
    ...sorted.map((t, i) => {
      const subs = t.subtasks;
      const doneCount = subs.filter((s) => s.done).length;
      return [
        { value: i + 1, type: Number, ...top, align: "center" },
        text(t.title, { ...wrapTop, fontWeight: "bold" }),
        text(clientOf(t.client).name, wrapTop),
        text(personName(t.assignee), wrapTop),
        text(t.priority, top),
        text(STATUS_LABEL[t.column] || t.column, top),
        dateCell(t.due, top),
        text(deadlineNote(t), top),
        dateTimeCell(t.createdAt, top),
        dateTimeCell(t.updatedAt, top),
        subs.length ? { value: doneCount / subs.length, type: Number, format: "0%", ...top, align: "center" } : text("-", { ...top, align: "center" }),
        text(subs.length ? `${doneCount} / ${subs.length}` : "0 / 0", { ...top, align: "center" }),
        text(lines(subs.map((s, n) => `${n + 1}. ${s.done ? "✓" : "☐"} ${s.text}${s.assignee ? ` (→ ${personName(s.assignee)})` : ""}`)), wrapTop),
        text(lines(subs.filter((s) => s.link).map((s) => `${s.text}: ${s.link}`)), wrapTop),
        text(lines(subs.filter((s) => s.note).map((s) => `• ${s.text}: ${s.note}`)), wrapTop),
        text(lines(subs.filter((s) => s.file).map((s) => s.file.name)), wrapTop),
      ];
    }),
  ];

  // ---- Sheet 2: Detail Subtask (dikelompokkan per tugas, warna selang-seling) ----
  const detailRows = [
    [
      "No Tugas", "Judul Tugas", "Klien", "PIC Tugas", "Prioritas", "Deadline", "No", "Subtask", "Ditugaskan ke", "Status Subtask",
      "Link", "Catatan Pekerjaan", "Lampiran", "Subtask Dibuat", "Subtask Diubah",
    ].map((value) => ({ value, ...HEADER, wrap: true })),
  ];
  let subtaskCount = 0;
  sorted.forEach((t, i) => {
    const band = i % 2 === 0 ? { backgroundColor: TASK_BAND } : {};
    const taskCells = (style) => [
      { value: i + 1, type: Number, align: "center", ...style },
      text(t.title, { wrap: true, fontWeight: "bold", ...style }),
      text(clientOf(t.client).name, { wrap: true, ...style }),
      text(personName(t.assignee), { wrap: true, ...style }),
      text(t.priority, style),
      dateCell(t.due, style),
    ];
    if (t.subtasks.length === 0) {
      detailRows.push([...taskCells({ ...top, ...band }), text("-", { ...top, ...band }), text("(tidak ada subtask)", { ...top, ...band, textColor: "#8A8782" }), ...Array(7).fill(text("-", { ...top, ...band }))]);
      return;
    }
    t.subtasks.forEach((s, n) => {
      subtaskCount += 1;
      const style = { ...top, ...band };
      detailRows.push([
        ...taskCells(style),
        { value: n + 1, type: Number, align: "center", ...style },
        text(s.text, { ...style, wrap: true }),
        text(personName(s.assignee), { ...style, wrap: true }),
        text(s.done ? "✓ Selesai" : "☐ Belum", { ...style, textColor: s.done ? "#0E7C7B" : "#B4453F" }),
        linkCell(s.link, style),
        text(s.note, { ...style, wrap: true }),
        text(s.file?.name, { ...style, wrap: true }),
        dateTimeCell(s.createdAt, style),
        dateTimeCell(s.updatedAt, style),
      ]);
    });
  });

  // ---- Sheet 3: Info Export ----
  const now = new Date();
  const infoRows = [
    [{ value: "Laporan Tugas Selesai", fontWeight: "bold", fontSize: 14 }, null],
    [null, null],
    [text("Diekspor oleh", { fontWeight: "bold" }), text(userData?.user?.email)],
    [text("Waktu export", { fontWeight: "bold" }), dateTimeCell(now.toISOString())],
    [text("Jumlah tugas", { fontWeight: "bold" }), { value: sorted.length, type: Number, align: "left" }],
    [text("Jumlah subtask", { fontWeight: "bold" }), { value: subtaskCount, type: Number, align: "left" }],
    [text("Klien", { fontWeight: "bold" }), text([...new Set(sorted.map((t) => clientOf(t.client).name))].join(", "), { wrap: true })],
    [null, null],
    [text("Catatan", { fontWeight: "bold" }), text("Hanya tugas berstatus Selesai yang diexport. File lampiran tidak ikut di dalam Excel; unduh lewat aplikasi Traicker.", { wrap: true })],
  ];

  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const blob = await writeExcelFile([
    {
      sheet: "Ringkasan",
      data: summaryRows,
      stickyRowsCount: 1,
      columns: [5, 40, 24, 18, 10, 11, 12, 16, 16, 16, 10, 10, 52, 46, 46, 28].map((width) => ({ width })),
    },
    {
      sheet: "Detail Subtask",
      data: detailRows,
      stickyRowsCount: 1,
      columns: [7, 36, 22, 18, 10, 12, 5, 40, 18, 14, 40, 46, 26, 16, 16].map((width) => ({ width })),
    },
    {
      sheet: "Info Export",
      data: infoRows,
      columns: [{ width: 18 }, { width: 70 }],
    },
  ]).toBlob();

  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const fileName = sorted.length === 1 ? `traicker-${slug(sorted[0].title)}-${stamp}.xlsx` : `traicker-selesai-${stamp}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tugas";
}
