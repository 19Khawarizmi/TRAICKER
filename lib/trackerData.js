import { supabase, ATTACHMENTS_BUCKET } from "@/lib/supabase";

// Bentuk data di UI tetap sama seperti versi localStorage:
// task = { id, title, client, assignee, priority, due, start, column, position, subtasks: [{ id, text, done, assignee, link, note, file: { name, path } }] }
// assignee / createdBy = id profil (public.profiles) atau null.

function toClient(row) {
  return { id: row.id, name: row.name, short: row.short_name, color: row.color, tint: row.tint, sortOrder: row.sort_order, archived: !!row.archived_at };
}

function toSubtask(row) {
  return {
    id: row.id,
    text: row.text,
    done: row.done,
    assignee: row.assignee_id || null,
    link: row.link || "",
    note: row.note || "",
    file: row.file_path ? { name: row.file_name, path: row.file_path } : null,
  };
}

function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    client: row.client_id,
    createdBy: row.created_by || null,
    assignee: row.assignee_id || null,
    priority: row.priority,
    due: row.due_date || "",
    start: row.start_date || "",
    column: row.status,
    position: row.position,
    subtasks: (row.subtasks || []).sort((a, b) => a.position - b.position).map(toSubtask),
  };
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

function toProfile(row) {
  return { id: row.id, email: row.email, name: row.display_name, role: row.role };
}

export async function fetchBoard() {
  const [clients, profiles, session, tasks] = await Promise.all([
    supabase.from("clients").select("id, name, short_name, color, tint, sort_order, archived_at").order("sort_order"),
    supabase.from("profiles").select("id, email, display_name, role").order("display_name"),
    supabase.auth.getSession(),
    supabase
      .from("tasks")
      .select("id, title, client_id, assignee_id, created_by, priority, due_date, start_date, status, position, subtasks (id, text, done, assignee_id, link, note, file_path, file_name, position)")
      .order("position"),
  ]);
  return {
    clients: check(clients).map(toClient),
    profiles: check(profiles).map(toProfile),
    currentUserId: session.data.session?.user.id || null,
    tasks: check(tasks).map(toTask),
  };
}

// Data lengkap untuk export, diambil langsung dari server supaya waktu "terakhir diubah" akurat.
// Hanya tugas berstatus done yang dikembalikan, walaupun id lain ikut dikirim.
export async function fetchDoneTasksForExport(ids) {
  const rows = check(
    await supabase
      .from("tasks")
      .select("id, title, client_id, assignee_id, priority, due_date, start_date, status, position, created_at, updated_at, subtasks (id, text, done, assignee_id, link, note, file_path, file_name, position, created_at, updated_at)")
      .in("id", ids)
      .eq("status", "done")
  );
  return rows.map((row) => ({
    ...toTask(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subtasks: (row.subtasks || [])
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ ...toSubtask(s), createdAt: s.created_at, updatedAt: s.updated_at })),
  }));
}

function filePathsOf(task) {
  return (task?.subtasks || []).map((s) => s.file?.path).filter(Boolean);
}

async function removeFiles(paths) {
  if (paths.length === 0) return;
  check(await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths));
}

// Update yang ditolak RLS tidak menghasilkan error, hanya 0 baris. Anggap itu sebagai "tidak punya akses".
async function updateOne(table, id, values) {
  const rows = check(await supabase.from(table).update(values).eq("id", id).select("id"));
  if (rows.length === 0) throw new Error("Kamu tidak punya akses untuk mengubah data ini.");
}

function subtaskRow(s, taskId, position) {
  return {
    id: s.id,
    task_id: taskId,
    text: s.text,
    done: s.done,
    assignee_id: s.assignee || null,
    link: s.link || null,
    note: s.note || null,
    file_path: s.file?.path || null,
    file_name: s.file?.name || null,
    position,
  };
}

function taskRow(task) {
  return {
    title: task.title.trim(),
    client_id: task.client,
    assignee_id: task.assignee || null,
    priority: task.priority,
    due_date: task.due || null,
    start_date: task.start || null,
    status: task.column,
    position: task.position,
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Kolom yang berubah saja, supaya perubahan anggota lain di kolom lain tidak tertimpa.
function changedValues(next, before) {
  if (!before) return next;
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => !same(v, before[k])));
}

// Subtask yang perlu ditulis: baru, atau ada isinya yang berubah dibanding saat panel dibuka.
export function changedSubtasks(task, base) {
  const before = new Map((base?.subtasks || []).map((s, i) => [s.id, subtaskRow(s, task.id, i)]));
  return task.subtasks.filter((s, i) => !before.has(s.id) || !same(subtaskRow(s, task.id, i), before.get(s.id)));
}

// Simpan tugas + subtask-nya (admin atau pemegang task).
// `base` = versi saat panel dibuka (null untuk tugas baru). Hanya yang diubah di panel yang ditulis,
// jadi kalau rekan lain mengubah tugas yang sama di saat bersamaan, perubahannya tidak hilang.
export async function saveTask(task, base) {
  if (!base) {
    // created_by diisi otomatis oleh database (auth.uid()).
    check(await supabase.from("tasks").insert({ id: task.id, ...taskRow(task) }));
  } else {
    const values = changedValues(taskRow(task), taskRow(base));
    if (Object.keys(values).length > 0) await updateOne("tasks", task.id, values);
  }

  const keepIds = new Set(task.subtasks.map((s) => s.id));
  const removedIds = (base?.subtasks || []).map((s) => s.id).filter((id) => !keepIds.has(id));
  if (removedIds.length > 0) {
    check(await supabase.from("subtasks").delete().in("id", removedIds));
  }

  // Subtask baru: tulis lengkap. Subtask lama: hanya kolom yang berubah (mis. urutan saja),
  // supaya centang/link yang baru diisi rekan lain tidak tertimpa.
  const before = new Map((base?.subtasks || []).map((s, i) => [s.id, subtaskRow(s, task.id, i)]));
  const rows = task.subtasks.map((s, i) => subtaskRow(s, task.id, i));
  const added = rows.filter((r) => !before.has(r.id));
  if (added.length > 0) check(await supabase.from("subtasks").insert(added));
  await Promise.all(
    rows
      .filter((r) => before.has(r.id))
      .map((r) => [r.id, changedValues(r, before.get(r.id))])
      .filter(([, values]) => Object.keys(values).length > 0)
      .map(([id, values]) => updateOne("subtasks", id, values))
  );

  const stillUsed = filePathsOf(task);
  await removeFiles(filePathsOf(base).filter((p) => !stillUsed.includes(p)));
}

// Untuk member yang hanya memegang subtask di task orang lain: simpan kolom pengerjaan saja.
// `originalSubtasks` = versi saat panel dibuka; subtask yang tidak diubah tidak ditulis.
export async function saveOwnSubtasks(subtasks, originalSubtasks) {
  const work = (s) => [s.done, s.link || null, s.note || null, s.file?.path || null];
  const opened = new Map(originalSubtasks.map((s) => [s.id, s]));
  const changed = subtasks.filter((s) => !opened.has(s.id) || !same(work(s), work(opened.get(s.id))));
  await Promise.all(
    changed.map((s) =>
      updateOne("subtasks", s.id, {
        done: s.done,
        link: s.link || null,
        note: s.note || null,
        file_path: s.file?.path || null,
        file_name: s.file?.name || null,
      })
    )
  );
  const stillUsed = subtasks.map((s) => s.file?.path).filter(Boolean);
  const before = originalSubtasks.filter((o) => subtasks.some((s) => s.id === o.id));
  await removeFiles(before.map((s) => s.file?.path).filter((p) => p && !stillUsed.includes(p)));
}

// Hasil drag & drop: cukup ubah satu baris karena posisi berupa angka desimal.
export async function moveTask(id, column, position) {
  await updateOne("tasks", id, { status: column, position });
}

export async function deleteTask(task) {
  const rows = check(await supabase.from("tasks").delete().eq("id", task.id).select("id"));
  if (rows.length === 0) throw new Error("Kamu tidak punya akses untuk menghapus tugas ini.");
  await removeFiles(filePathsOf(task));
}

export async function uploadAttachment(taskId, subtaskId, file) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${taskId}/${subtaskId}/${Date.now()}-${safeName}`;
  check(await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: file.type || undefined }));
  return { name: file.name, path };
}

export async function attachmentUrl(file) {
  const data = check(await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(file.path, 60, { download: file.name }));
  return data.signedUrl;
}

// ---- Klien (hanya admin; dijaga RLS) ----

export async function createClientRow(client) {
  check(
    await supabase.from("clients").insert({
      id: client.id,
      name: client.name,
      short_name: client.short,
      color: client.color,
      tint: client.tint,
      sort_order: client.sortOrder,
    })
  );
}

export async function setClientArchived(id, archived) {
  await updateOne("clients", id, { archived_at: archived ? new Date().toISOString() : null });
}

export async function deleteClientRow(id) {
  const { data, error } = await supabase.from("clients").delete().eq("id", id).select("id");
  // 23503 = masih ada task yang memakai klien ini.
  if (error?.code === "23503") throw new Error("Klien ini masih punya tugas. Arsipkan saja, atau pindahkan/hapus tugasnya dulu.");
  if (error) throw error;
  if (data.length === 0) throw new Error("Kamu tidak punya akses untuk menghapus klien ini.");
}

// ---- Anggota tim (hanya admin; dicek ulang di server /api/admin/users) ----

async function adminFetch(path, method, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesi login habis. Silakan masuk ulang.");
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Permintaan gagal.");
  return json;
}

export async function createTeamMember({ name, email, password, role }) {
  return (await adminFetch("/api/admin/users", "POST", { name, email, password, role })).user;
}

// `changes` boleh berisi sebagian: { name, email, role, password }.
export async function updateTeamMember(id, changes) {
  return adminFetch(`/api/admin/users/${id}`, "PATCH", changes);
}

export async function removeTeamMember(id) {
  await adminFetch(`/api/admin/users/${id}`, "DELETE");
}

// ---- Komentar & riwayat aktivitas per task ----

// Gabungan komentar + aktivitas, urut dari yang paling lama.
// `field` = "task_id" (project) atau "post_id" (content plan).
export async function fetchTaskFeed(taskId, field = "task_id") {
  const [comments, activity] = await Promise.all([
    supabase.from("task_comments").select("id, author_id, body, created_at, updated_at").eq(field, taskId).order("created_at"),
    supabase.from("task_activity").select("id, actor_id, action, meta, created_at").eq(field, taskId).order("created_at"),
  ]);
  const items = [
    ...check(comments).map((c) => ({ kind: "comment", id: c.id, userId: c.author_id, body: c.body, at: c.created_at, edited: c.updated_at !== c.created_at })),
    ...check(activity).map((a) => ({ kind: "activity", id: `a${a.id}`, userId: a.actor_id, action: a.action, meta: a.meta, at: a.created_at })),
  ];
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export async function addComment(taskId, body, field = "task_id") {
  check(await supabase.from("task_comments").insert({ [field]: taskId, body: body.trim() }));
}

export async function updateComment(id, body) {
  await updateOne("task_comments", id, { body: body.trim() });
}

export async function deleteComment(id) {
  const rows = check(await supabase.from("task_comments").delete().eq("id", id).select("id"));
  if (rows.length === 0) throw new Error("Kamu tidak punya akses untuk menghapus komentar ini.");
}

// ---- Notifikasi (RLS: hanya milik user yang login) ----

export async function fetchNotifications(limit = 40) {
  const rows = check(
    await supabase.from("notifications").select("id, actor_id, task_id, post_id, type, title, body, read_at, created_at").order("created_at", { ascending: false }).limit(limit)
  );
  return rows.map((n) => ({ id: n.id, actorId: n.actor_id, taskId: n.task_id, postId: n.post_id, type: n.type, title: n.title, body: n.body, read: !!n.read_at, at: n.created_at }));
}

// Tandai sudah dibaca: daftar id tertentu, atau semua kalau `ids` kosong.
export async function markNotificationsRead(ids) {
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  check(await q);
}

// Ganti tanggal tugas (dipakai kalender). Tanggal kosong disimpan sebagai null.
export async function updateTaskDates(id, { due, start }) {
  await updateOne("tasks", id, { due_date: due || null, start_date: start || null });
}
