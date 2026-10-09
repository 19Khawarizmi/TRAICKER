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

// Simpan tugas + semua subtask-nya (admin atau pemegang task). `original` = versi sebelum diedit, null untuk tugas baru.
export async function saveTask(task, original) {
  const values = {
    title: task.title.trim(),
    client_id: task.client,
    assignee_id: task.assignee || null,
    priority: task.priority,
    due_date: task.column === "ongoing" || !task.due ? null : task.due,
    start_date: task.column === "ongoing" || !task.start ? null : task.start,
    status: task.column,
    position: task.position,
  };
  if (original) {
    await updateOne("tasks", task.id, values);
  } else {
    // created_by diisi otomatis oleh database (auth.uid()).
    check(await supabase.from("tasks").insert({ id: task.id, ...values }));
  }

  const keepIds = task.subtasks.map((s) => s.id);
  const removedIds = (original?.subtasks || []).map((s) => s.id).filter((id) => !keepIds.includes(id));
  if (removedIds.length > 0) {
    check(await supabase.from("subtasks").delete().in("id", removedIds));
  }

  if (task.subtasks.length > 0) {
    check(await supabase.from("subtasks").upsert(task.subtasks.map((s, i) => subtaskRow(s, task.id, i))));
  }

  const stillUsed = filePathsOf(task);
  await removeFiles(filePathsOf(original).filter((p) => !stillUsed.includes(p)));
}

// Untuk member yang hanya memegang subtask di task orang lain: simpan kolom pengerjaan saja.
export async function saveOwnSubtasks(subtasks, originalSubtasks) {
  await Promise.all(
    subtasks.map((s) =>
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
export async function fetchTaskFeed(taskId) {
  const [comments, activity] = await Promise.all([
    supabase.from("task_comments").select("id, author_id, body, created_at, updated_at").eq("task_id", taskId).order("created_at"),
    supabase.from("task_activity").select("id, actor_id, action, meta, created_at").eq("task_id", taskId).order("created_at"),
  ]);
  const items = [
    ...check(comments).map((c) => ({ kind: "comment", id: c.id, userId: c.author_id, body: c.body, at: c.created_at, edited: c.updated_at !== c.created_at })),
    ...check(activity).map((a) => ({ kind: "activity", id: `a${a.id}`, userId: a.actor_id, action: a.action, meta: a.meta, at: a.created_at })),
  ];
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export async function addComment(taskId, body) {
  check(await supabase.from("task_comments").insert({ task_id: taskId, body: body.trim() }));
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
    await supabase.from("notifications").select("id, actor_id, task_id, type, title, body, read_at, created_at").order("created_at", { ascending: false }).limit(limit)
  );
  return rows.map((n) => ({ id: n.id, actorId: n.actor_id, taskId: n.task_id, type: n.type, title: n.title, body: n.body, read: !!n.read_at, at: n.created_at }));
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
