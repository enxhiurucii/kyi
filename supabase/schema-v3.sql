-- KYI schema v3 — opt-in Express interest (investor → discoverable company).
-- Run after schema-v2.sql.

create table if not exists public.interests (
  id uuid primary key default gen_random_uuid(),
  investor_user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  unique (investor_user_id, company_id)
);

alter table public.interests enable row level security;

drop policy if exists "investor manages own interests" on public.interests;
create policy "investor manages own interests" on public.interests
  for all
  using (investor_user_id = auth.uid())
  with check (investor_user_id = auth.uid());

drop policy if exists "founder sees interest in own company" on public.interests;
create policy "founder sees interest in own company" on public.interests
  for select
  using (
    exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_id = auth.uid()
    )
  );

-- Founders who received interest may read the investor's public profile fields (not the reverse).
drop policy if exists "founder sees investor who expressed interest" on public.investor_profiles;
create policy "founder sees investor who expressed interest" on public.investor_profiles
  for select
  using (
    exists (
      select 1
      from public.interests i
      join public.companies c on c.id = i.company_id
      where i.investor_user_id = investor_profiles.id
        and c.owner_id = auth.uid()
    )
  );

create index if not exists interests_company_id_idx on public.interests (company_id);
create index if not exists interests_investor_user_id_idx on public.interests (investor_user_id);
