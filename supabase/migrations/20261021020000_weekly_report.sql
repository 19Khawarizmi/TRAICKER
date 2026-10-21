-- Report mingguan (Senin–Minggu) di samping report bulanan.
--   Tiap konten punya dua set angka: w_* = dicatat saat report mingguan, m_* = dicatat saat report bulanan.
--   Followers dicatat per tanggal (bukan per bulan). Followers suatu periode = catatan terakhir di dalam periode itu.

-- 1. Angka mingguan per konten -----------------------------------------------------------------
alter table public.content_posts
  add column w_likes integer check (w_likes is null or w_likes >= 0),
  add column w_comments integer check (w_comments is null or w_comments >= 0),
  add column w_shares integer check (w_shares is null or w_shares >= 0),
  add column w_reposts integer check (w_reposts is null or w_reposts >= 0),
  add column w_saves integer check (w_saves is null or w_saves >= 0),
  add column w_clicks integer check (w_clicks is null or w_clicks >= 0),
  add column w_follows integer check (w_follows is null or w_follows >= 0),
  add column w_impressions integer check (w_impressions is null or w_impressions >= 0),
  add column w_reach integer check (w_reach is null or w_reach >= 0),
  add column weekly_metrics_updated_at timestamptz;

-- 2. Followers per tanggal ---------------------------------------------------------------------
alter table public.content_followers drop constraint content_followers_month_check;
alter table public.content_followers rename column month to recorded_on;
-- Catatan lama "bulan X" (tanggal 1) berarti followers akhir bulan X.
update public.content_followers
  set recorded_on = (date_trunc('month', recorded_on) + interval '1 month - 1 day')::date
  where extract(day from recorded_on) = 1;

-- 3. Log aktivitas: bedakan angka mingguan / bulanan --------------------------------------------
create or replace function private.on_post_metrics_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  monthly_changed boolean;
  weekly_changed boolean;
begin
  monthly_changed := (new.m_likes, new.m_comments, new.m_shares, new.m_reposts, new.m_saves, new.m_clicks, new.m_follows, new.m_impressions, new.m_reach)
    is distinct from (old.m_likes, old.m_comments, old.m_shares, old.m_reposts, old.m_saves, old.m_clicks, old.m_follows, old.m_impressions, old.m_reach);
  weekly_changed := (new.w_likes, new.w_comments, new.w_shares, new.w_reposts, new.w_saves, new.w_clicks, new.w_follows, new.w_impressions, new.w_reach)
    is distinct from (old.w_likes, old.w_comments, old.w_shares, old.w_reposts, old.w_saves, old.w_clicks, old.w_follows, old.w_impressions, old.w_reach);
  if monthly_changed or weekly_changed
     or (new.is_boosted, new.insight) is distinct from (old.is_boosted, old.insight) then
    perform private.log_post_activity(new.id, 'metrics', jsonb_build_object(
      'kind', case when monthly_changed and weekly_changed then 'both'
                   when weekly_changed then 'weekly'
                   when monthly_changed then 'monthly'
                   else 'notes' end,
      'reach', case when weekly_changed and not monthly_changed then new.w_reach else new.m_reach end));
  end if;
  return new;
end;
$$;
revoke all on function private.on_post_metrics_change() from public, anon, authenticated;
