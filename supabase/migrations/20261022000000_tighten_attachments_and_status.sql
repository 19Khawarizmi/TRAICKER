-- Pengetatan hasil review keamanan.

-- 1. Lampiran subtask (bucket "attachments", path: <task_id>/<subtask_id>/<file>) -----------------
--    Dulu: semua anggota bisa upload/ubah/hapus file mana pun.
--    Sekarang: admin, pemegang tugas, pemegang subtask, atau pengunggah file itu sendiri.
--    Folder tugas yang belum/tidak ada lagi tetap boleh (upload sebelum tugas baru disimpan,
--    dan bersih-bersih file setelah tugasnya dihapus).
drop policy if exists "authenticated upload attachments" on storage.objects;
drop policy if exists "authenticated update attachments" on storage.objects;
drop policy if exists "authenticated delete attachments" on storage.objects;

create policy "upload attachments" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments' and (
      (select private.is_admin())
      or not exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1])
      or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.assignee_id = (select auth.uid()))
      or exists (select 1 from public.subtasks s where s.id::text = (storage.foldername(name))[2] and s.assignee_id = (select auth.uid()))
    )
  );

create policy "update attachments" on storage.objects for update to authenticated
  using (
    bucket_id = 'attachments' and (
      (select private.is_admin())
      or owner_id = (select auth.uid())::text
      or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.assignee_id = (select auth.uid()))
    )
  )
  with check (bucket_id = 'attachments');

create policy "delete attachments" on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments' and (
      (select private.is_admin())
      or owner_id = (select auth.uid())::text
      or not exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1])
      or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.assignee_id = (select auth.uid()))
      or exists (select 1 from public.subtasks s where s.id::text = (storage.foldername(name))[2] and s.assignee_id = (select auth.uid()))
    )
  );

-- 2. Status "ongoing" sudah tidak ada di papan; tugas berstatus itu akan "hilang" dari tampilan. ----
alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('todo', 'progress', 'review', 'done'));
