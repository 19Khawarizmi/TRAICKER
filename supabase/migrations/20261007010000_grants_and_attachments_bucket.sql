-- Grant eksplisit ke Data API: tabel baru di public tidak lagi otomatis terekspos.
-- anon tidak perlu akses sama sekali; semua lewat user yang login.
revoke all on public.clients, public.tasks, public.subtasks from anon;
grant select, insert, update, delete on public.clients, public.tasks, public.subtasks to authenticated;

-- Bucket privat untuk lampiran subtask (pengganti data URL di localStorage).
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 4194304)
on conflict (id) do nothing;

create policy "authenticated read attachments" on storage.objects
  for select to authenticated using (bucket_id = 'attachments');
create policy "authenticated upload attachments" on storage.objects
  for insert to authenticated with check (bucket_id = 'attachments');
create policy "authenticated update attachments" on storage.objects
  for update to authenticated using (bucket_id = 'attachments') with check (bucket_id = 'attachments');
create policy "authenticated delete attachments" on storage.objects
  for delete to authenticated using (bucket_id = 'attachments');
