-- Ruang kerja Content plan: platform yang bisa diatur, postingan konten, dan pemakaian ulang
-- komentar / aktivitas / notifikasi yang sudah ada (sekarang bisa menunjuk task ATAU konten).

-- 1. Platform (bisa ditambah admin) ---------------------------------------------------------
create table public.content_platforms (
  id text primary key,                                -- slug, mis. 'instagram'
  name text not null check (length(trim(name)) > 0),
  short_name text not null check (length(trim(short_name)) between 1 and 6),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  formats text[] not null default '{}',
  char_limit integer check (char_limit is null or char_limit > 0),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.content_platforms (id, name, short_name, color, formats, char_limit, sort_order) values
  ('instagram', 'Instagram', 'IG', '#C13584', '{Feed,Carousel,Reels,Story}', 2200, 1),
  ('linkedin', 'LinkedIn', 'IN', '#0A66C2', '{Post,Carousel,Artikel,Video}', 3000, 2);

alter table public.content_platforms enable row level security;
grant select, insert, update, delete on public.content_platforms to authenticated;
create policy "read platforms" on public.content_platforms for select to authenticated using (true);
create policy "admin insert platforms" on public.content_platforms for insert to authenticated with check ((select private.is_admin()));
create policy "admin update platforms" on public.content_platforms for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete platforms" on public.content_platforms for delete to authenticated using ((select private.is_admin()));

-- 2. Postingan konten -------------------------------------------------------------------------
create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients (id) on update cascade,
  platform_id text not null references public.content_platforms (id) on update cascade,
  format text,
  title text not null check (length(trim(title)) > 0),
  publish_date date,
  publish_time time,
  pillar text,
  brief text,
  caption text,
  hashtags text,
  visual_link text,
  post_link text,
  status text not null default 'brief'
    check (status in ('brief', 'production', 'internal_review', 'revision', 'scheduled', 'published')),
  approval text not null default 'none' check (approval in ('none', 'waiting', 'approved', 'changes')),
  approval_note text,
  approval_at timestamptz,
  specialist_id uuid references public.profiles (id) on delete set null,
  designer_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_posts_client_idx on public.content_posts (client_id);
create index content_posts_platform_idx on public.content_posts (platform_id);
create index content_posts_publish_idx on public.content_posts (publish_date, publish_time);
create index content_posts_status_idx on public.content_posts (status);
create index content_posts_specialist_idx on public.content_posts (specialist_id);
create index content_posts_designer_idx on public.content_posts (designer_id);
create index content_posts_created_by_idx on public.content_posts (created_by);

create trigger content_posts_set_updated_at before update on public.content_posts
  for each row execute function public.set_updated_at();
-- Fungsi ini generik (mengunci kolom created_by), dipakai juga oleh tasks.
create trigger content_posts_keep_created_by before update on public.content_posts
  for each row execute function private.keep_task_created_by();

alter table public.content_posts enable row level security;
grant select, insert, update, delete on public.content_posts to authenticated;

-- Admin: semua. Member: membuat konten untuk dirinya, mengubah konten yang dia pegang
-- (sebagai sosmed specialist atau desainer), menghapus konten buatannya sendiri.
create policy "read posts" on public.content_posts for select to authenticated using (true);
create policy "insert posts" on public.content_posts for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and ((select private.is_admin()) or specialist_id = (select auth.uid()) or designer_id = (select auth.uid()))
  );
create policy "update posts" on public.content_posts for update to authenticated
  using ((select private.is_admin()) or specialist_id = (select auth.uid()) or designer_id = (select auth.uid()))
  with check ((select private.is_admin()) or specialist_id = (select auth.uid()) or designer_id = (select auth.uid()));
create policy "delete posts" on public.content_posts for delete to authenticated
  using ((select private.is_admin()) or created_by = (select auth.uid()));

-- 3. Komentar, aktivitas, notifikasi: bisa untuk task ATAU konten ------------------------------
alter table public.task_comments alter column task_id drop not null;
alter table public.task_comments add column post_id uuid references public.content_posts (id) on delete cascade;
alter table public.task_comments add constraint task_comments_one_target check (num_nonnulls(task_id, post_id) = 1);
create index task_comments_post_created_idx on public.task_comments (post_id, created_at);

alter table public.task_activity alter column task_id drop not null;
alter table public.task_activity add column post_id uuid references public.content_posts (id) on delete cascade;
alter table public.task_activity add constraint task_activity_one_target check (num_nonnulls(task_id, post_id) = 1);
create index task_activity_post_created_idx on public.task_activity (post_id, created_at);

alter table public.notifications add column post_id uuid references public.content_posts (id) on delete cascade;
create index notifications_post_idx on public.notifications (post_id);

create or replace function private.log_post_activity(p_post uuid, p_action text, p_meta jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_activity (post_id, actor_id, action, meta)
  values (p_post, (select auth.uid()), p_action, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function private.notify_post(p_user uuid, p_post uuid, p_type text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = (select auth.uid()) then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, post_id, type, title, body)
  values (p_user, (select auth.uid()), p_post, p_type, p_title, p_body);
end;
$$;

-- 4. Trigger konten: catat aktivitas & beri tahu PIC yang baru ditugaskan ---------------------
create or replace function private.on_post_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_post_activity(new.id, 'created', jsonb_build_object('status', new.status));
    perform private.notify_post(new.specialist_id, new.id, 'assigned',
      private.actor_name() || ' menugaskanmu (sosmed): ' || new.title, null);
    if new.designer_id is distinct from new.specialist_id then
      perform private.notify_post(new.designer_id, new.id, 'assigned',
        private.actor_name() || ' menugaskanmu (desain): ' || new.title, null);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    perform private.log_post_activity(new.id, 'status', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.approval is distinct from old.approval then
    perform private.log_post_activity(new.id, 'approval', jsonb_build_object('from', old.approval, 'to', new.approval));
  end if;
  if new.publish_date is distinct from old.publish_date or new.publish_time is distinct from old.publish_time then
    perform private.log_post_activity(new.id, 'schedule', jsonb_build_object('date', new.publish_date, 'time', new.publish_time));
  end if;
  if new.specialist_id is distinct from old.specialist_id then
    perform private.log_post_activity(new.id, 'specialist', jsonb_build_object('to', new.specialist_id));
    perform private.notify_post(new.specialist_id, new.id, 'assigned',
      private.actor_name() || ' menugaskanmu (sosmed): ' || new.title, null);
  end if;
  if new.designer_id is distinct from old.designer_id then
    perform private.log_post_activity(new.id, 'designer', jsonb_build_object('to', new.designer_id));
    perform private.notify_post(new.designer_id, new.id, 'assigned',
      private.actor_name() || ' menugaskanmu (desain): ' || new.title, null);
  end if;
  if new.title is distinct from old.title then
    perform private.log_post_activity(new.id, 'title', jsonb_build_object('from', old.title, 'to', new.title));
  end if;
  if new.platform_id is distinct from old.platform_id or new.format is distinct from old.format then
    perform private.log_post_activity(new.id, 'platform', jsonb_build_object('platform', new.platform_id, 'format', new.format));
  end if;
  if new.client_id is distinct from old.client_id then
    perform private.log_post_activity(new.id, 'client', jsonb_build_object('from', old.client_id, 'to', new.client_id));
  end if;
  return new;
end;
$$;

create trigger content_posts_activity after insert or update on public.content_posts
  for each row execute function private.on_post_change();

-- 5. Notifikasi komentar: sekarang menangani task maupun konten --------------------------------
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
  if new.post_id is not null then
    select title into v_title from public.content_posts where id = new.post_id;
    for v_user in
      select distinct u from (
        select specialist_id as u from public.content_posts where id = new.post_id
        union select designer_id from public.content_posts where id = new.post_id
        union select created_by from public.content_posts where id = new.post_id
        union select author_id from public.task_comments where post_id = new.post_id and id <> new.id
      ) people
      where u is not null
    loop
      perform private.notify_post(v_user, new.post_id, 'comment',
        private.actor_name() || ' mengomentari konten: ' || v_title, left(new.body, 160));
    end loop;
    return new;
  end if;

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

revoke all on function private.log_post_activity(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.notify_post(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function private.on_post_change() from public, anon, authenticated;
revoke all on function private.on_comment_insert() from public, anon, authenticated;

-- 6. Realtime ----------------------------------------------------------------------------------
alter publication supabase_realtime add table public.content_posts, public.content_platforms;
