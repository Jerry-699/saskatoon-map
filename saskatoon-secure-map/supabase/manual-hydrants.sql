-- Run this once in Supabase -> SQL Editor.
-- It creates a separate table for hydrants manually added by an admin.

create table if not exists public.manual_hydrants (
  id uuid primary key default gen_random_uuid(),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text,
  note text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.manual_hydrants enable row level security;

drop policy if exists "Approved users can read manual hydrants" on public.manual_hydrants;
create policy "Approved users can read manual hydrants"
on public.manual_hydrants
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.approved = true or p.is_admin = true)
  )
);

drop policy if exists "Admins can add manual hydrants" on public.manual_hydrants;
create policy "Admins can add manual hydrants"
on public.manual_hydrants
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

drop policy if exists "Admins can delete manual hydrants" on public.manual_hydrants;
create policy "Admins can delete manual hydrants"
on public.manual_hydrants
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
);

grant select, insert, delete on table public.manual_hydrants to authenticated;
