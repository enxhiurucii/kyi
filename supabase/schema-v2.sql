-- KYI schema v2 — investor profiles, watchlist, discoverable companies.
-- Run after schema.sql (or on an existing KYI Supabase project).

create table if not exists public.investor_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  firm_name text,
  cala_firm_id text,
  role_title text,
  thesis_sectors text[] not null default '{}',
  thesis_stages text[] not null default '{}',
  thesis_regions text[] not null default '{}',
  ticket_min_eur numeric,
  ticket_max_eur numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investor_profiles enable row level security;

drop policy if exists "own investor profile" on public.investor_profiles;
create policy "own investor profile" on public.investor_profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_ref text not null,
  company_name text not null,
  data_mode text not null check (data_mode in ('cala','demo')),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, company_ref)
);

alter table public.watchlist_items enable row level security;

drop policy if exists "own watchlist" on public.watchlist_items;
create policy "own watchlist" on public.watchlist_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.companies add column if not exists discoverable boolean not null default false;

drop policy if exists "discoverable companies are readable" on public.companies;
create policy "discoverable companies are readable" on public.companies
  for select using (discoverable = true);
