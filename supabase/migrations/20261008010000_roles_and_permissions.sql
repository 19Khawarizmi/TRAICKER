-- Peran admin/member dan aturan akses berbasis penugasan.
--   Admin  : semua akses.
--   Member : lihat semua; buat task (otomatis ditugaskan ke dirinya); edit task yang ditugaskan ke dirinya;
--            hapus task yang dia buat sendiri; di subtask milik orang lain yang ditugaskan ke dirinya,
--            hanya boleh mengubah status selesai, link, catatan, dan lampiran.

-- 1. Peran. Tidak ada policy UPDATE di profiles, jadi peran hanya bisa diubah lewat dashboard/SQL.
alter table public.profiles add column role text not null default 'member' check (role in ('admin', 'member'));
update public.profiles set role = 'admin' where email in ('19khawarizmi@gmail.com', 'aikriting@gmail.com');

-- 2. Pembuat task (seperti "Reporter" di Jira). Task lama dibiarkan null.
alter table public.tasks add column created_by uuid references public.profiles (id) on delete set null default auth.uid();
create index tasks_created_by_idx on public.tasks (created_by);

-- 3. Posisi desimal: drag & drop cukup mengubah satu baris (nilai di antara dua tetangga).
alter table public.tasks alter column position type double precision;
alter table public.tasks alter column position set default 0;

-- 4. Helper untuk policy. SECURITY INVOKER cukup karena profiles memang boleh dibaca user login.
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

create or replace function private.is_task_assignee(p_task_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.tasks where id = p_task_id and assignee_id = (select auth.uid()));
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_task_assignee(uuid) from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_task_assignee(uuid) to authenticated;

-- 5. Clients: semua boleh lihat, hanya admin yang mengelola.
drop policy "authenticated manage clients" on public.clients;
create policy "read clients" on public.clients for select to authenticated using (true);
create policy "admin insert clients" on public.clients for insert to authenticated with check ((select private.is_admin()));
create policy "admin update clients" on public.clients for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete clients" on public.clients for delete to authenticated using ((select private.is_admin()));

-- 6. Tasks
drop policy "authenticated manage tasks" on public.tasks;

create policy "read tasks" on public.tasks for select to authenticated using (true);

create policy "insert tasks" on public.tasks for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and ((select private.is_admin()) or assignee_id = (select auth.uid()))
  );

-- Member hanya bisa mengubah task miliknya dan tidak bisa memindahkan penugasan ke orang lain.
create policy "update tasks" on public.tasks for update to authenticated
  using ((select private.is_admin()) or assignee_id = (select auth.uid()))
  with check ((select private.is_admin()) or assignee_id = (select auth.uid()));

create policy "delete tasks" on public.tasks for delete to authenticated
  using ((select private.is_admin()) or created_by = (select auth.uid()));

-- created_by tidak boleh diubah setelah dibuat.
create or replace function private.keep_task_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_by := old.created_by;
  return new;
end;
$$;

create trigger tasks_keep_created_by before update on public.tasks
  for each row execute function private.keep_task_created_by();

-- 7. Subtasks
drop policy "authenticated manage subtasks" on public.subtasks;

create policy "read subtasks" on public.subtasks for select to authenticated using (true);

create policy "insert subtasks" on public.subtasks for insert to authenticated
  with check ((select private.is_admin()) or private.is_task_assignee(task_id));

create policy "update subtasks" on public.subtasks for update to authenticated
  using ((select private.is_admin()) or private.is_task_assignee(task_id) or assignee_id = (select auth.uid()))
  with check ((select private.is_admin()) or private.is_task_assignee(task_id) or assignee_id = (select auth.uid()));

create policy "delete subtasks" on public.subtasks for delete to authenticated
  using ((select private.is_admin()) or private.is_task_assignee(task_id));

-- Assignee subtask yang bukan admin/pemegang task hanya boleh mengubah kolom pengerjaan.
create or replace function private.limit_subtask_assignee_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Perubahan dari dashboard/SQL editor (tanpa user login) tidak dibatasi.
  if (select auth.uid()) is null or private.is_admin() or private.is_task_assignee(old.task_id) then
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

create trigger subtasks_limit_assignee_update before update on public.subtasks
  for each row execute function private.limit_subtask_assignee_update();
