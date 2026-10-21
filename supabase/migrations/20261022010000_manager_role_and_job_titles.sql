-- Peran (hak akses) dan jabatan (label) dipisah.
--   role      : admin | manager | member — menentukan siapa boleh apa (dijaga RLS).
--   job_title : Social Media Specialist, Graphic Designer, dst. — hanya label, tidak memengaruhi hak akses.
-- Manager: boleh membuat, mengedit, menugaskan, dan menggeser semua tugas & konten.
--          Tidak bisa mengelola anggota, klien, platform, target, dan kuota. Menghapus hanya yang dia buat sendiri.

-- 1. Peran manager --------------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'manager', 'member'));

create or replace function private.can_manage_work()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'manager'));
$$;
revoke all on function private.can_manage_work() from public, anon;
grant execute on function private.can_manage_work() to authenticated;

-- 2. Jabatan (dikelola admin) ---------------------------------------------------------------------
create table public.job_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index job_titles_name_key on public.job_titles (lower(trim(name)));

alter table public.job_titles enable row level security;
grant select, insert, update, delete on public.job_titles to authenticated;
create policy "read job titles" on public.job_titles for select to authenticated using (true);
create policy "admin insert job titles" on public.job_titles for insert to authenticated with check ((select private.is_admin()));
create policy "admin update job titles" on public.job_titles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete job titles" on public.job_titles for delete to authenticated using ((select private.is_admin()));

insert into public.job_titles (name, sort_order) values
  ('Social Media Specialist', 1),
  ('Graphic Designer', 2),
  ('Video Editor', 3),
  ('Copywriter', 4);

-- Jabatan anggota diubah lewat server admin (/api/admin/users), sama seperti nama dan peran.
alter table public.profiles add column job_title_id uuid references public.job_titles (id) on delete set null;
create index profiles_job_title_id_idx on public.profiles (job_title_id);

alter publication supabase_realtime add table public.job_titles;

-- 3. Aturan akses: admin → admin atau manager untuk pekerjaan sehari-hari -----------------------
drop policy "insert tasks" on public.tasks;
create policy "insert tasks" on public.tasks for insert to authenticated
  with check (created_by = (select auth.uid()) and ((select private.can_manage_work()) or assignee_id = (select auth.uid())));
drop policy "update tasks" on public.tasks;
create policy "update tasks" on public.tasks for update to authenticated
  using ((select private.can_manage_work()) or assignee_id = (select auth.uid()))
  with check ((select private.can_manage_work()) or assignee_id = (select auth.uid()));

drop policy "insert subtasks" on public.subtasks;
create policy "insert subtasks" on public.subtasks for insert to authenticated
  with check ((select private.can_manage_work()) or private.is_task_assignee(task_id));
drop policy "update subtasks" on public.subtasks;
create policy "update subtasks" on public.subtasks for update to authenticated
  using ((select private.can_manage_work()) or private.is_task_assignee(task_id) or assignee_id = (select auth.uid()))
  with check ((select private.can_manage_work()) or private.is_task_assignee(task_id) or assignee_id = (select auth.uid()));
drop policy "delete subtasks" on public.subtasks;
create policy "delete subtasks" on public.subtasks for delete to authenticated
  using ((select private.can_manage_work()) or private.is_task_assignee(task_id));

create or replace function private.limit_subtask_assignee_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.can_manage_work() or private.is_task_assignee(old.task_id) then
    return new;
  end if;
  if new.task_id is distinct from old.task_id
     or new.text is distinct from old.text
     or new.assignee_id is distinct from old.assignee_id
     or new.position is distinct from old.position then
    raise exception 'Kamu hanya boleh mengubah status, link, catatan, dan lampiran di subtask ini.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop policy "insert posts" on public.content_posts;
create policy "insert posts" on public.content_posts for insert to authenticated
  with check (created_by = (select auth.uid()) and ((select private.can_manage_work())
    or specialist_id = (select auth.uid()) or designer_id = (select auth.uid())));
drop policy "update posts" on public.content_posts;
create policy "update posts" on public.content_posts for update to authenticated
  using ((select private.can_manage_work()) or specialist_id = (select auth.uid()) or designer_id = (select auth.uid()))
  with check ((select private.can_manage_work()) or specialist_id = (select auth.uid()) or designer_id = (select auth.uid()));

-- Lampiran: manager boleh seperti admin (karena boleh mengedit semua tugas).
drop policy "upload attachments" on storage.objects;
create policy "upload attachments" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments' and (
      (select private.can_manage_work())
      or not exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1])
      or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.assignee_id = (select auth.uid()))
      or exists (select 1 from public.subtasks s where s.id::text = (storage.foldername(name))[2] and s.assignee_id = (select auth.uid()))
    )
  );
drop policy "update attachments" on storage.objects;
create policy "update attachments" on storage.objects for update to authenticated
  using (
    bucket_id = 'attachments' and (
      (select private.can_manage_work())
      or owner_id = (select auth.uid())::text
      or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.assignee_id = (select auth.uid()))
    )
  )
  with check (bucket_id = 'attachments');
drop policy "delete attachments" on storage.objects;
create policy "delete attachments" on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments' and (
      (select private.can_manage_work())
      or owner_id = (select auth.uid())::text
      or not exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1])
      or exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[1] and t.assignee_id = (select auth.uid()))
      or exists (select 1 from public.subtasks s where s.id::text = (storage.foldername(name))[2] and s.assignee_id = (select auth.uid()))
    )
  );
