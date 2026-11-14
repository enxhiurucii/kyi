-- Run this in the Supabase SQL editor (KYI accounts).
create table public.founders (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text,
  linkedin_url text,
  location text,
  bio text,
  past_companies text[] not null default '{}',
  schools text[] not null default '{}',
  cala_person_id text,
  cala_snapshot jsonb,
  confirmed_identity boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  one_liner text not null,
  stage text not null check (stage in ('pre-seed','seed','series-a','series-b','series-c+','growth')),
  country text,
  sectors text[] not null default '{}',
  website text,
  founded_year int,
  raising_amount_eur numeric,
  existing_investors text[] not null default '{}',
  cala_company_id text,
  cala_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);
create table public.investor_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.investor_lists(id) on delete cascade,
  investor_name text not null,
  investor_ref text not null,
  data_mode text not null check (data_mode in ('cala','demo')),
  status text not null default 'to_contact'
    check (status in ('to_contact','contacted','meeting_booked','met','follow_up','passed','committed')),
  notes text,
  meeting_at timestamptz,
  last_fit_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, investor_ref)
);
alter table public.founders enable row level security;
alter table public.companies enable row level security;
alter table public.investor_lists enable row level security;
alter table public.list_items enable row level security;
create policy "own founder" on public.founders
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own company" on public.companies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own lists" on public.investor_lists
  for all using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = auth.uid()));
create policy "own list items" on public.list_items
  for all using (exists (select 1 from public.investor_lists l join public.companies c on c.id = l.company_id
                         where l.id = list_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.investor_lists l join public.companies c on c.id = l.company_id
                      where l.id = list_id and c.owner_id = auth.uid()));
