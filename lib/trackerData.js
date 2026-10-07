import { supabase, ATTACHMENTS_BUCKET } from "@/lib/supabase";

// Bentuk data di UI tetap sama seperti versi localStorage:
// task = { id, title, client, priority, due, column, position, subtasks: [{ id, text, done, link, note, file: { name, path } }] }

function toClient(row) {
  return { id: row.id, name: row.name, short: row.short_name, color: row.color, tint: row.tint };
}

function toSubtask(row) {
  return {
    id: row.id,
    text: row.text,
    done: row.done,
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
    priority: row.priority,
    due: row.due_date || "",
    column: row.status,
    position: row.position,
    subtasks: (row.subtasks || []).sort((a, b) => a.position - b.position).map(toSubtask),
  };
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function fetchBoard() {
  const [clients, tasks] = await Promise.all([
    supabase.from("clients").select("id, name, short_name, color, tint").order("sort_order"),
    supabase
      .from("tasks")
      .select("id, title, client_id, priority, due_date, status, position, subtasks (id, text, done, link, note, file_path, file_name, position)")
      .order("position"),
  ]);
  return { clients: check(clients).map(toClient), tasks: check(tasks).map(toTask) };
}

function filePathsOf(task) {
  return (task?.subtasks || []).map((s) => s.file?.path).filter(Boolean);
}

async function removeFiles(paths) {
  if (paths.length === 0) return;
  check(await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths));
}

// Simpan tugas + subtask-nya. `original` = versi sebelum diedit (null untuk tugas baru).
export async function saveTask(task, original) {
  check(
    await supabase.from("tasks").upsert({
      id: task.id,
      title: task.title.trim(),
      client_id: task.client,
      priority: task.priority,
      due_date: task.column === "ongoing" || !task.due ? null : task.due,
      status: task.column,
      position: task.position,
    })
  );

  const keepIds = task.subtasks.map((s) => s.id);
  const removedIds = (original?.subtasks || []).map((s) => s.id).filter((id) => !keepIds.includes(id));
  if (removedIds.length > 0) {
    check(await supabase.from("subtasks").delete().in("id", removedIds));
  }

  if (task.subtasks.length > 0) {
    check(
      await supabase.from("subtasks").upsert(
        task.subtasks.map((s, i) => ({
          id: s.id,
          task_id: task.id,
          text: s.text,
          done: s.done,
          link: s.link || null,
          note: s.note || null,
          file_path: s.file?.path || null,
          file_name: s.file?.name || null,
          position: i,
        }))
      )
    );
  }

  const stillUsed = filePathsOf(task);
  await removeFiles(filePathsOf(original).filter((p) => !stillUsed.includes(p)));
}

export async function moveTask(id, column) {
  check(await supabase.from("tasks").update({ status: column }).eq("id", id));
}

export async function deleteTask(task) {
  check(await supabase.from("tasks").delete().eq("id", task.id));
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
