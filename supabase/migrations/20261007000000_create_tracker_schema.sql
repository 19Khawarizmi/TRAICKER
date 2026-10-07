-- Schema awal Traicker: klien, tugas (kartu kanban), dan subtask.
-- Mengikuti bentuk data di components/AgencyTracker.jsx (CLIENTS, COLUMNS, PRIORITIES, seedTasks).

create table public.clients (
  id text primary key,                      -- slug, mis. 'immfc'
  name text not null,
  short_name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  tint text not null check (tint ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  client_id text not null references public.clients (id) on update cascade,
  priority text not null default 'Sedang' check (priority in ('Tinggi', 'Sedang', 'Rendah')),
  status text not null default 'todo' check (status in ('todo', 'progress', 'ongoing', 'review', 'done')),
  due_date date,                            -- null untuk status 'ongoing'
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_client_id_idx on public.tasks (client_id);
create index tasks_status_position_idx on public.tasks (status, position);
create index tasks_due_date_open_idx on public.tasks (due_date) where status not in ('done', 'ongoing');

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  done boolean not null default false,
  link text,
  note text,
  file_path text,                           -- path di Supabase Storage (pengganti data URL localStorage)
  file_name text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subtasks_task_id_position_idx on public.subtasks (task_id, position);

-- updated_at otomatis
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger subtasks_set_updated_at before update on public.subtasks
  for each row execute function public.set_updated_at();

-- RLS: tool internal, akses hanya untuk user yang sudah login.
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;

create policy "authenticated manage clients" on public.clients
  for all to authenticated using (true) with check (true);

create policy "authenticated manage tasks" on public.tasks
  for all to authenticated using (true) with check (true);

create policy "authenticated manage subtasks" on public.subtasks
  for all to authenticated using (true) with check (true);
