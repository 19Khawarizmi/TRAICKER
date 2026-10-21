// Export content plan ke Excel (.xlsx): format yang biasa dikirim ke klien untuk approval.
// Library Excel baru dimuat saat tombol diklik.

import { supabase } from "@/lib/supabase";
import { STAGE_BY_ID, APPROVAL_BY_ID } from "@/lib/contentData";

const HEADER = { fontWeight: "bold", backgroundColor: "#232220", textColor: "#FFFFFF", alignVertical: "center", wrap: true };
const top = { alignVertical: "top" };
const wrapTop = { wrap: true, alignVertical: "top" };

function text(value, style) {
  return { value: value === undefined || value === null || value === "" ? "-" : String(value), ...style };
}

// write-excel-file menghitung tanggal dalam UTC; pakai Date.UTC supaya tanggal tidak mundur sehari.
function dateCell(ymd, style) {
  if (!ymd) return text("-", style);
  const [y, m, d] = ymd.split("-").map(Number);
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: "ddd, dd/mm/yyyy", ...style };
}

function linkCell(url, style) {
  if (!url) return text("-", style);
  if (url.length > 250 || !/^https?:\/\//i.test(url)) return text(url, style);
  const safe = url.replace(/"/g, '""');
  return { value: `HYPERLINK("${safe}","${safe}")`, type: "Formula", textColor: "#3D6FA6", ...style };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "semua-klien";
}

export async function exportContentPlan(posts, { clientOf, platformOf, profileOf, clientName }) {
  if (posts.length === 0) return;
  const person = (id) => profileOf(id)?.name || "-";

  const rows = [
    [
      "No", "Tanggal tayang", "Jam", "Klien", "Platform", "Format", "Judul", "Pilar", "Brief", "Caption",
      "Hashtag", "Link visual", "Tahap", "Approval klien", "Catatan klien", "Sosmed specialist", "Desainer / Kreatif", "Link postingan",
    ].map((value) => ({ value, ...HEADER })),
    ...posts.map((p, i) => [
      { value: i + 1, type: Number, align: "center", ...top },
      dateCell(p.date, top),
      text(p.time, top),
      text(clientOf(p.client).name, wrapTop),
      text(platformOf(p.platform)?.name, top),
      text(p.format, top),
      text(p.title, { ...wrapTop, fontWeight: "bold" }),
      text(p.pillar, wrapTop),
      text(p.brief, wrapTop),
      text(p.caption, wrapTop),
      text(p.hashtags, wrapTop),
      linkCell(p.visualLink, top),
      text(STAGE_BY_ID[p.status]?.label, top),
      text(APPROVAL_BY_ID[p.approval]?.label, top),
      text(p.approvalNote, wrapTop),
      text(person(p.specialist), top),
      text(person(p.designer), top),
      linkCell(p.postLink, top),
    ]),
  ];

  const { data: userData } = await supabase.auth.getUser();
  const now = new Date();
  const info = [
    [{ value: "Content plan", fontWeight: "bold", fontSize: 14 }, null],
    [null, null],
    [text("Klien", { fontWeight: "bold" }), text(clientName || "Semua klien")],
    [text("Jumlah konten", { fontWeight: "bold" }), { value: posts.length, type: Number, align: "left" }],
    [text("Diekspor oleh", { fontWeight: "bold" }), text(userData?.user?.email)],
    [text("Waktu export", { fontWeight: "bold" }), { value: new Date(now.getTime() - now.getTimezoneOffset() * 60000), type: Date, format: "dd/mm/yyyy hh:mm" }],
  ];

  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const blob = await writeExcelFile([
    {
      sheet: "Content plan",
      data: rows,
      stickyRowsCount: 1,
      columns: [5, 17, 7, 22, 12, 11, 34, 16, 40, 60, 30, 34, 15, 18, 30, 18, 18, 30].map((width) => ({ width })),
    },
    { sheet: "Info Export", data: info, columns: [{ width: 18 }, { width: 50 }] },
  ]).toBlob();

  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `content-plan-${slug(clientName || "semua klien")}-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
