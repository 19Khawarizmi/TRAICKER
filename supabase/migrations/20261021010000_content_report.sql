-- Report performa organik untuk Content plan (input manual).
--   Engagement   = likes + komentar + share + repost + saved (sama untuk semua platform).
--   Aksi         = klik / profile visit + follow (dicatat terpisah, tidak masuk engagement).
--   ER postingan = engagement / reach.  ER bulanan = total engagement / total reach.
-- Rumus dihitung di app; database hanya menyimpan angka mentah.

-- 1. Metrik per konten -------------------------------------------------------------------------
alter table public.content_posts
  add column m_likes integer check (m_likes is null or m_likes >= 0),
  add column m_comments integer check (m_comments is null or m_comments >= 0),
  add column m_shares integer check (m_shares is null or m_shares >= 0),
  add column m_reposts integer check (m_reposts is null or m_reposts >= 0),
  add column m_saves integer check (m_saves is null or m_saves >= 0),
  add column m_clicks integer check (m_clicks is null or m_clicks >= 0),
  add column m_follows integer check (m_follows is null or m_follows >= 0),
  add column m_impressions integer check (m_impressions is null or m_impressions >= 0),
  add column m_reach integer check (m_reach is null or m_reach >= 0),
  add column is_boosted boolean not null default false,
  add column insight text,
  add column metrics_updated_at timestamptz;

-- 2. Followers per bulan (snapshot akhir bulan) per klien per platform --------------------------
create table public.content_followers (
  client_id text not null references public.clients (id) on update cascade on delete cascade,
  platform_id text not null references public.content_platforms (id) on update cascade on delete cascade,
  month date not null check (extract(day from month) = 1),   -- selalu tanggal 1
  followers integer not null check (followers >= 0),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (client_id, platform_id, month)
);
create index content_followers_platform_idx on public.content_followers (platform_id);
create index content_followers_updated_by_idx on public.content_followers (updated_by);
create trigger content_followers_set_updated_at before update on public.content_followers
  for each row execute function public.set_updated_at();

alter table public.content_followers enable row level security;
grant select, insert, update, delete on public.content_followers to authenticated;
-- Seluruh tim boleh mencatat followers (biasanya sosmed specialist); hapus hanya admin.
create policy "read followers" on public.content_followers for select to authenticated using (true);
create policy "insert followers" on public.content_followers for insert to authenticated
  with check (updated_by = (select auth.uid()));
create policy "update followers" on public.content_followers for update to authenticated
  using (true) with check (updated_by = (select auth.uid()));
create policy "admin delete followers" on public.content_followers for delete to authenticated
  using ((select private.is_admin()));

-- 3. Target KPI per klien (3 / 6 bulan) --------------------------------------------------------
create table public.content_targets (
  client_id text not null references public.clients (id) on update cascade on delete cascade,
  metric text not null check (metric in ('followers_growth', 'engagement_rate', 'reach', 'website_visits', 'inbound_leads')),
  horizon_months integer not null check (horizon_months in (3, 6)),
  target numeric not null check (target >= 0),
  updated_at timestamptz not null default now(),
  primary key (client_id, metric, horizon_months)
);
create trigger content_targets_set_updated_at before update on public.content_targets
  for each row execute function public.set_updated_at();

alter table public.content_targets enable row level security;
grant select, insert, update, delete on public.content_targets to authenticated;
create policy "read targets" on public.content_targets for select to authenticated using (true);
create policy "admin insert targets" on public.content_targets for insert to authenticated with check ((select private.is_admin()));
create policy "admin update targets" on public.content_targets for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete targets" on public.content_targets for delete to authenticated using ((select private.is_admin()));

-- 4. Kuota konten kontrak per klien per platform ---------------------------------------------
create table public.content_quotas (
  client_id text not null references public.clients (id) on update cascade on delete cascade,
  platform_id text not null references public.content_platforms (id) on update cascade on delete cascade,
  quota integer not null check (quota > 0),
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now(),
  primary key (client_id, platform_id),
  check (start_date <= end_date)
);
create index content_quotas_platform_idx on public.content_quotas (platform_id);
create trigger content_quotas_set_updated_at before update on public.content_quotas
  for each row execute function public.set_updated_at();

alter table public.content_quotas enable row level security;
grant select, insert, update, delete on public.content_quotas to authenticated;
create policy "read quotas" on public.content_quotas for select to authenticated using (true);
create policy "admin insert quotas" on public.content_quotas for insert to authenticated with check ((select private.is_admin()));
create policy "admin update quotas" on public.content_quotas for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete quotas" on public.content_quotas for delete to authenticated using ((select private.is_admin()));

-- 5. Catat aktivitas saat metrik diperbarui (satu baris per simpan, bukan per angka) ----------
create or replace function private.on_post_metrics_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.m_likes, new.m_comments, new.m_shares, new.m_reposts, new.m_saves, new.m_clicks, new.m_follows, new.m_impressions, new.m_reach, new.is_boosted, new.insight)
     is distinct from
     (old.m_likes, old.m_comments, old.m_shares, old.m_reposts, old.m_saves, old.m_clicks, old.m_follows, old.m_impressions, old.m_reach, old.is_boosted, old.insight) then
    perform private.log_post_activity(new.id, 'metrics', jsonb_build_object('reach', new.m_reach));
  end if;
  return new;
end;
$$;
revoke all on function private.on_post_metrics_change() from public, anon, authenticated;
create trigger content_posts_metrics_activity after update on public.content_posts
  for each row execute function private.on_post_metrics_change();

alter publication supabase_realtime add table public.content_followers, public.content_targets, public.content_quotas;
