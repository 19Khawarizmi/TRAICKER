-- Komentar, riwayat aktivitas, notifikasi, tanggal mulai (untuk Timeline), dan Realtime.
-- Aktivitas & notifikasi diisi oleh trigger database (SECURITY DEFINER di schema privat),
-- jadi tidak bisa dipalsukan dari browser: user tidak punya izin INSERT ke kedua tabel itu.

-- 1. Tanggal mulai untuk tampilan Timeline -----------------------------------------------
alter table public.tasks add column start_date date;
alter table public.tasks add constraint tasks_start_before_due
  check (start_date is null or due_date is null or start_date <= due_date);

-- 2. Komentar -----------------------------------------------------------------------------
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_comments_task_created_idx on public.task_comments (task_id, created_at);
create index task_comments_author_idx on public.task_comments (author_id);

create trigger task_comments_set_updated_at before update on public.task_comments
  for each row execute function public.set_updated_at();

alter table public.task_comments enable row level security;
grant select, insert, update, delete on public.task_comments to authenticated;

create policy "read comments" on public.task_comments for select to authenticated using (true);
create policy "insert own comments" on public.task_comments for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "update own comments" on public.task_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "delete own comments or admin" on public.task_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));

-- 3. Riwayat aktivitas (hanya diisi trigger) ----------------------------------------------
create table public.task_activity (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index task_activity_task_created_idx on public.task_activity (task_id, created_at);
create index task_activity_actor_idx on public.task_activity (actor_id);

alter table public.task_activity enable row level security;
grant select on public.task_activity to authenticated;
create policy "read activity" on public.task_activity for select to authenticated using (true);

-- 4. Notifikasi (hanya diisi trigger; tiap user hanya melihat miliknya) --------------------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  task_id uuid references public.tasks (id) on delete cascade,
  type text not null check (type in ('assigned', 'subtask_assigned', 'comment')),
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_task_idx on public.notifications (task_id);
create index notifications_actor_idx on public.notifications (actor_id);

alter table public.notifications enable row level security;
grant select, update, delete on public.notifications to authenticated;
create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "update own notifications" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own notifications" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- 5. Helper trigger ------------------------------------------------------------------------
create or replace function private.log_activity(p_task uuid, p_action text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_activity (task_id, actor_id, action, meta)
  values (p_task, (select auth.uid()), p_action, coalesce(p_meta, '{}'::jsonb));
$$;

-- Tidak memberi notifikasi ke diri sendiri atau ke user kosong.
create or replace function private.notify(p_user uuid, p_task uuid, p_type text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = (select auth.uid()) then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, task_id, type, title, body)
  values (p_user, (select auth.uid()), p_task, p_type, p_title, p_body);
end;
$$;

create or replace function private.actor_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select display_name from public.profiles where id = (select auth.uid())), 'Seseorang');
$$;

-- 6. Trigger tasks ---------------------------------------------------------------------------
create or replace function private.on_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.id, 'created', jsonb_build_object('status', new.status));
    if new.assignee_id is not null then
      perform private.notify(new.assignee_id, new.id, 'assigned',
        private.actor_name() || ' menugaskanmu: ' || new.title, null);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    perform private.log_activity(new.id, 'status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    perform private.log_activity(new.id, 'assigned', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
    perform private.notify(new.assignee_id, new.id, 'assigned',
      private.actor_name() || ' menugaskanmu: ' || new.title, null);
  end if;
  if new.due_date is distinct from old.due_date then
    perform private.log_activity(new.id, 'due', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if new.start_date is distinct from old.start_date then
    perform private.log_activity(new.id, 'start', jsonb_build_object('from', old.start_date, 'to', new.start_date));
  end if;
  if new.priority is distinct from old.priority then
    perform private.log_activity(new.id, 'priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;
  if new.title is distinct from old.title then
    perform private.log_activity(new.id, 'title', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.client_id is distinct from old.client_id then
    perform private.log_activity(new.id, 'client', jsonb_build_object('from', old.client_id, 'to', new.client_id));
  end if;
  return new;
end;
$$;

create trigger tasks_activity after insert or update on public.tasks
  for each row execute function private.on_task_change();

-- 7. Trigger subtasks ------------------------------------------------------------------------
create or replace function private.on_subtask_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_title text;
begin
  if tg_op = 'DELETE' then
    -- Saat task dihapus, subtask ikut terhapus (cascade) dan task-nya sudah tidak ada: jangan dicatat.
    if exists (select 1 from public.tasks where id = old.task_id) then
      perform private.log_activity(old.task_id, 'subtask_removed', jsonb_build_object('text', old.text));
    end if;
    return old;
  end if;

  select title into v_task_title from public.tasks where id = new.task_id;

  if tg_op = 'INSERT' then
    perform private.log_activity(new.task_id, 'subtask_added', jsonb_build_object('text', new.text));
    if new.assignee_id is not null then
      perform private.notify(new.assignee_id, new.task_id, 'subtask_assigned',
        private.actor_name() || ' memberimu subtask: ' || new.text, v_task_title);
    end if;
    return new;
  end if;

  if new.done is distinct from old.done then
    perform private.log_activity(new.task_id, case when new.done then 'subtask_done' else 'subtask_undone' end,
      jsonb_build_object('text', new.text));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    perform private.log_activity(new.task_id, 'subtask_assigned', jsonb_build_object('text', new.text, 'to', new.assignee_id));
    perform private.notify(new.assignee_id, new.task_id, 'subtask_assigned',
      private.actor_name() || ' memberimu subtask: ' || new.text, v_task_title);
  end if;
  if new.text is distinct from old.text then
    perform private.log_activity(new.task_id, 'subtask_renamed', jsonb_build_object('from', old.text, 'to', new.text));
  end if;
  return new;
end;
$$;

create trigger subtasks_activity after insert or update or delete on public.subtasks
  for each row execute function private.on_subtask_change();

-- 8. Trigger komentar: beri tahu semua yang terlibat di task (kecuali penulisnya) ----------
create or replace function private.on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_user uuid;
begin
  select title into v_title from public.tasks where id = new.task_id;
  for v_user in
    select distinct u from (
      select assignee_id as u from public.tasks where id = new.task_id
      union select created_by from public.tasks where id = new.task_id
      union select assignee_id from public.subtasks where task_id = new.task_id
      union select author_id from public.task_comments where task_id = new.task_id and id <> new.id
    ) people
    where u is not null
  loop
    perform private.notify(v_user, new.task_id, 'comment',
      private.actor_name() || ' mengomentari: ' || v_title, left(new.body, 160));
  end loop;
  return new;
end;
$$;

create trigger task_comments_notify after insert on public.task_comments
  for each row execute function private.on_comment_insert();

revoke all on function private.log_activity(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.notify(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.actor_name() from public, anon, authenticated;
revoke all on function private.on_task_change() from public, anon, authenticated;
revoke all on function private.on_subtask_change() from public, anon, authenticated;
revoke all on function private.on_comment_insert() from public, anon, authenticated;

-- 9. Realtime: perubahan tabel-tabel ini dikirim langsung ke app (tetap mengikuti RLS) ------
alter publication supabase_realtime add table
  public.tasks, public.subtasks, public.clients, public.profiles,
  public.task_comments, public.task_activity, public.notifications;
