-- Direktori anggota tim + penugasan (assignee) di tasks dan subtasks.
-- auth.users tidak bisa dibaca dari browser, jadi datanya dicerminkan ke public.profiles lewat trigger.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

-- Semua anggota tim boleh melihat daftar anggota (untuk memilih assignee).
create policy "authenticated read profiles" on public.profiles
  for select to authenticated using (true);

-- Fungsi trigger di schema privat (tidak terekspos lewat Data API).
create schema if not exists private;

create or replace function private.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- User tanpa email (mis. login nomor HP) dilewati supaya pembuatan user tidak gagal.
  if new.email is null then
    return new;
  end if;
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

revoke all on function private.sync_profile_from_auth() from public, anon, authenticated;

create trigger on_auth_user_synced
  after insert or update of email on auth.users
  for each row execute function private.sync_profile_from_auth();

-- Isi profil untuk user yang sudah ada.
insert into public.profiles (id, email, display_name)
select id, email, coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), nullif(raw_user_meta_data ->> 'name', ''), split_part(email, '@', 1))
from auth.users
where email is not null
on conflict (id) do nothing;

-- Penugasan: satu orang per task / subtask. Kalau user dihapus, penugasannya dikosongkan.
alter table public.tasks add column assignee_id uuid references public.profiles (id) on delete set null;
alter table public.subtasks add column assignee_id uuid references public.profiles (id) on delete set null;

create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index subtasks_assignee_id_idx on public.subtasks (assignee_id);
