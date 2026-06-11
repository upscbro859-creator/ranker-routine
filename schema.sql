-- ============================================================
--  THE RANKER ROUTINE — Supabase schema
--  Run this whole file once in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) PROFILES ------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'Aspirant',
  role        text not null default 'student' check (role in ('student','admin')),
  created_at  timestamptz not null default now(),
  last_seen   date
);

-- 2) ENTRIES (one daily routine per student per day) ---------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  targets     jsonb not null default '[]',          -- array of strings
  pct         int,                                  -- % target achieved (0-100)
  hours       numeric,                              -- hours studied
  eff         int,                                  -- efficiency 1-5
  tomorrow    text,
  checklist   jsonb not null default '{}',          -- {revision, dna, topper}
  manifest    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists entries_user_date_idx on public.entries (user_id, date desc);

-- 3) ADMIN CHECK (SECURITY DEFINER avoids RLS recursion) -----
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 4) AUTO-CREATE A PROFILE WHEN A USER SIGNS UP --------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Aspirant'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) ROW LEVEL SECURITY --------------------------------------
alter table public.profiles enable row level security;
alter table public.entries  enable row level security;

-- profiles: you can see your own; admins see everyone
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- profiles: you can update your own row only
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid());

-- entries: a student reads ONLY their own; admin reads all
drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries
  for select using (user_id = auth.uid() or public.is_admin());

-- entries: a student writes ONLY their own
drop policy if exists entries_insert on public.entries;
create policy entries_insert on public.entries
  for insert with check (user_id = auth.uid());

drop policy if exists entries_update on public.entries;
create policy entries_update on public.entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists entries_delete on public.entries;
create policy entries_delete on public.entries
  for delete using (user_id = auth.uid());

-- ============================================================
--  6) MAKE YOURSELF THE ADMIN
--  After you have signed up once with YOUR email in the app,
--  run this (replace the email) to become admin:
--
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'you@example.com');
--
-- ============================================================
