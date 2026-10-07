// Export tugas berstatus "done" ke file Excel (.xlsx) dengan dua sheet: Tugas dan Subtask.
// Library dimuat saat tombol export diklik supaya tidak menambah ukuran halaman awal.

const PRIORITY_ORDER = { Tinggi: 0, Sedang: 1, Rendah: 2 };

function header(labels) {
  return labels.map((value) => ({ value, fontWeight: "bold", backgroundColor: "#EEEDE8" }));
}

function dateCell(d) {
  return d ? { value: new Date(d + "T00:00:00"), type: Date, format: "dd/mm/yyyy" } : null;
}

export async function exportDoneTasks(tasks, clientOf) {
  const done = tasks.filter((t) => t.column === "done");
  if (done.length === 0) return;

  const sorted = [...done].sort(
    (a, b) =>
      clientOf(a.client).name.localeCompare(clientOf(b.client).name) ||
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
      a.title.localeCompare(b.title)
  );

  const taskRows = [
    header(["No", "Judul Tugas", "Klien", "Prioritas", "Deadline", "Subtask Selesai", "Total Subtask", "Lampiran"]),
    ...sorted.map((t, i) => {
      const subs = t.subtasks || [];
      return [
        { value: i + 1, type: Number },
        { value: t.title },
        { value: clientOf(t.client).name },
        { value: t.priority },
        dateCell(t.due),
        { value: subs.filter((s) => s.done).length, type: Number },
        { value: subs.length, type: Number },
        { value: subs.filter((s) => s.file).length, type: Number },
      ];
    }),
  ];

  const subtaskRows = [
    header(["Judul Tugas", "Klien", "Subtask", "Selesai", "Link", "Catatan", "Nama File Lampiran"]),
    ...sorted.flatMap((t) =>
      (t.subtasks || []).map((s) => [
        { value: t.title },
        { value: clientOf(t.client).name },
        { value: s.text },
        { value: s.done ? "Ya" : "Belum" },
        s.link ? { value: s.link } : null,
        s.note ? { value: s.note, wrap: true } : null,
        s.file ? { value: s.file.name } : null,
      ])
    ),
  ];

  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const blob = await writeExcelFile([
    {
      sheet: "Tugas",
      data: taskRows,
      stickyRowsCount: 1,
      columns: [{ width: 5 }, { width: 48 }, { width: 26 }, { width: 10 }, { width: 12 }, { width: 15 }, { width: 13 }, { width: 10 }],
    },
    {
      sheet: "Subtask",
      data: subtaskRows,
      stickyRowsCount: 1,
      columns: [{ width: 40 }, { width: 26 }, { width: 42 }, { width: 9 }, { width: 36 }, { width: 44 }, { width: 28 }],
    },
  ]).toBlob();

  const today = new Date();
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const fileName = done.length === 1 ? `traicker-${slug(done[0].title)}-${stamp}.xlsx` : `traicker-selesai-${stamp}.xlsx`;

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
