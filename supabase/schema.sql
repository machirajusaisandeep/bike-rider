-- Bike Rider leaderboard schema for Supabase (Postgres + PostgREST).
--
-- Setup:
--   1. Create a free Supabase project.
--   2. Paste this file into the SQL editor and run it.
--   3. Put the project URL and anon key into the build env:
--        VITE_SUPABASE_URL=https://xxxx.supabase.co
--        VITE_SUPABASE_ANON_KEY=eyJ...
--      (GitHub Actions reads them from repository variables SUPABASE_URL / SUPABASE_ANON_KEY.)
--
-- Anyone can read the board and insert a run. Inserts are checked server-side for
-- plausibility and rate-limited per IP so casual cheating is bounded; the daily board is the
-- honest one because it resets.

create extension if not exists pgcrypto;

create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  mode          text not null check (mode in ('ride', 'daily', 'mission')),
  scene         text not null check (scene in ('munnar','ladakh','wayanad','ooty','varkala','bengaluru')),
  seed          bigint not null check (seed > 0),
  day           integer,                          -- YYYYMMDD for daily runs
  score         integer not null check (score >= 0),
  distance_m    integer not null check (distance_m >= 0),
  duration_s    real    not null check (duration_s >= 0),
  top_kmh       real    not null check (top_kmh between 0 and 140),
  near_misses   integer not null check (near_misses >= 0),
  best_combo    integer not null check (best_combo >= 0),
  protection    integer not null check (protection between 0 and 100),
  handle        text    not null check (char_length(handle) between 1 and 16),
  ip_hash       text
);

create index if not exists runs_ride_board on public.runs (scene, score desc) where mode in ('ride','mission');
create index if not exists runs_daily_board on public.runs (day, score desc) where mode = 'daily';
create index if not exists runs_ip_recent on public.runs (ip_hash, created_at desc);

-- Plausibility + rate limit + handle hygiene, mirrored from src/game/Scoring.ts plausibleScore().
create or replace function public.runs_guard()
returns trigger language plpgsql security definer as $$
declare
  recent integer;
  ip text;
begin
  -- ~34 m/s top speed with slack for slopes
  if new.distance_m > new.duration_s * 40 + 50 then
    raise exception 'implausible distance';
  end if;
  -- dense oncoming traffic with a maxed combo peaks around 8 points per metre
  if new.score > new.distance_m * 12 + 1500 then
    raise exception 'implausible score';
  end if;
  if new.mode = 'daily' and new.day is null then
    raise exception 'daily runs need a day';
  end if;
  new.handle := regexp_replace(trim(new.handle), '[^A-Za-z0-9 _.\-]', '', 'g');
  if char_length(new.handle) < 1 then new.handle := 'Rider'; end if;

  -- Rate limit: 30 submissions per IP per 10 minutes.
  ip := coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '');
  new.ip_hash := encode(digest(split_part(ip, ',', 1), 'sha256'), 'hex');
  select count(*) into recent from public.runs
    where ip_hash = new.ip_hash and created_at > now() - interval '10 minutes';
  if recent >= 30 then
    raise exception 'rate limited';
  end if;
  return new;
end $$;

drop trigger if exists runs_guard_trg on public.runs;
create trigger runs_guard_trg before insert on public.runs
  for each row execute function public.runs_guard();

alter table public.runs enable row level security;

drop policy if exists "board is public" on public.runs;
create policy "board is public" on public.runs
  for select to anon, authenticated using (true);

drop policy if exists "anyone can post a run" on public.runs;
create policy "anyone can post a run" on public.runs
  for insert to anon, authenticated with check (true);

-- Never expose ip_hash through the API.
revoke all on public.runs from anon, authenticated;
grant select (id, created_at, mode, scene, seed, day, score, distance_m, duration_s, top_kmh, near_misses, best_combo, protection, handle)
  on public.runs to anon, authenticated;
grant insert (mode, scene, seed, day, score, distance_m, duration_s, top_kmh, near_misses, best_combo, protection, handle)
  on public.runs to anon, authenticated;

-- Optional housekeeping: keep only the last 60 days of daily runs.
-- select cron.schedule('purge-old-dailies', '0 4 * * *',
--   $$delete from public.runs where mode = 'daily' and created_at < now() - interval '60 days'$$);
