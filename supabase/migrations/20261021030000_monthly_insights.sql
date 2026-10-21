-- Report bulanan memakai angka akun langsung dari Insights platform (tanggal 1–akhir bulan),
-- bukan penjumlahan angka per konten. Angka per konten cukup satu set (m_*), diisi saat report mingguan.

-- 1. Kembali ke satu set angka per konten ------------------------------------------------------
update public.content_posts set
  m_likes = coalesce(w_likes, m_likes),
  m_comments = coalesce(w_comments, m_comments),
  m_shares = coalesce(w_shares, m_shares),
  m_reposts = coalesce(w_reposts, m_reposts),
  m_saves = coalesce(w_saves, m_saves),
  m_clicks = coalesce(w_clicks, m_clicks),
  m_follows = coalesce(w_follows, m_follows),
  m_impressions = coalesce(w_impressions, m_impressions),
  m_reach = coalesce(w_reach, m_reach)
where num_nonnulls(w_likes, w_comments, w_shares, w_reposts, w_saves, w_clicks, w_follows, w_impressions, w_reach) > 0;

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

alter table public.content_posts
  drop column w_likes, drop column w_comments, drop column w_shares, drop column w_reposts, drop column w_saves,
  drop column w_clicks, drop column w_follows, drop column w_impressions, drop column w_reach,
  drop column weekly_metrics_updated_at;

-- 2. Angka akun bulanan dari Insights, per klien per platform -------------------------------------
create table public.content_insights (
  client_id text not null references public.clients (id) on update cascade on delete cascade,
  platform_id text not null references public.content_platforms (id) on update cascade on delete cascade,
  month date not null check (extract(day from month) = 1),   -- selalu tanggal 1
  followers integer check (followers is null or followers >= 0),
  reach integer check (reach is null or reach >= 0),
  engagement integer check (engagement is null or engagement >= 0),
  impressions integer check (impressions is null or impressions >= 0),
  profile_visits integer check (profile_visits is null or profile_visits >= 0),
  posts integer check (posts is null or posts >= 0),
  link_clicks integer check (link_clicks is null or link_clicks >= 0),
  new_follows integer check (new_follows is null or new_follows >= 0),
  unfollows integer check (unfollows is null or unfollows >= 0),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (client_id, platform_id, month)
);
create index content_insights_platform_idx on public.content_insights (platform_id);
create index content_insights_updated_by_idx on public.content_insights (updated_by);
create trigger content_insights_set_updated_at before update on public.content_insights
  for each row execute function public.set_updated_at();

alter table public.content_insights enable row level security;
grant select, insert, update, delete on public.content_insights to authenticated;
-- Seluruh tim boleh mengisi angka Insights; hapus hanya admin.
create policy "read insights" on public.content_insights for select to authenticated using (true);
create policy "insert insights" on public.content_insights for insert to authenticated
  with check (updated_by = (select auth.uid()));
create policy "update insights" on public.content_insights for update to authenticated
  using (true) with check (updated_by = (select auth.uid()));
create policy "admin delete insights" on public.content_insights for delete to authenticated
  using ((select private.is_admin()));

alter publication supabase_realtime add table public.content_insights;
