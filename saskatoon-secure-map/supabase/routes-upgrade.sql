-- Run this in Supabase SQL Editor if your login/approval system is already working.

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  points jsonb not null,
  sort_order integer not null default 100,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routes enable row level security;

drop policy if exists "approved users read routes" on public.routes;
create policy "approved users read routes"
on public.routes
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.approved = true or p.is_admin = true)
  )
);

drop policy if exists "admins insert routes" on public.routes;
create policy "admins insert routes"
on public.routes
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins update routes" on public.routes;
create policy "admins update routes"
on public.routes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins delete routes" on public.routes;
create policy "admins delete routes"
on public.routes
for delete
to authenticated
using (public.is_admin());
