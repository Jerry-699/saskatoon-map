-- Run this ONCE in Supabase -> SQL Editor. Safe to run again.
-- Admin edits stay in routes/manual_hydrants as a working draft.
-- Normal users read published_routes/published_manual_hydrants only.
-- publish_map_data() copies BOTH working sets atomically and bumps one version.

create table if not exists public.app_settings (
  key text primary key,
  value bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('map_data_version', 1)
on conflict (key) do nothing;

create table if not exists public.published_routes (
  id uuid primary key,
  name text not null unique,
  points jsonb not null,
  sort_order integer not null default 100,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.published_manual_hydrants (
  id uuid primary key,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text,
  note text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null
);

-- First install: publish the data that already exists so users see no change.
insert into public.published_routes (id,name,points,sort_order,uploaded_by,created_at,updated_at)
select id,name,points,sort_order,uploaded_by,created_at,updated_at from public.routes
on conflict (id) do nothing;

insert into public.published_manual_hydrants (id,latitude,longitude,address,note,added_by,created_at)
select id,latitude,longitude,address,note,added_by,created_at from public.manual_hydrants
on conflict (id) do nothing;

alter table public.app_settings enable row level security;
alter table public.published_routes enable row level security;
alter table public.published_manual_hydrants enable row level security;

drop policy if exists "Approved users can read app settings" on public.app_settings;
create policy "Approved users can read app settings" on public.app_settings for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.blocked=false and (p.approved=true or p.is_admin=true)));

drop policy if exists "Approved users read published routes" on public.published_routes;
create policy "Approved users read published routes" on public.published_routes for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.blocked=false and (p.approved=true or p.is_admin=true)));

drop policy if exists "Approved users read published manual hydrants" on public.published_manual_hydrants;
create policy "Approved users read published manual hydrants" on public.published_manual_hydrants for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.blocked=false and (p.approved=true or p.is_admin=true)));

grant select on public.app_settings, public.published_routes, public.published_manual_hydrants to authenticated;

create or replace function public.publish_map_data()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version bigint;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true and p.blocked = false
  ) then
    raise exception 'Admin access required';
  end if;

  delete from public.published_routes where id is not null;
  insert into public.published_routes (id,name,points,sort_order,uploaded_by,created_at,updated_at)
  select id,name,points,sort_order,uploaded_by,created_at,updated_at from public.routes;

  delete from public.published_manual_hydrants where id is not null;
  insert into public.published_manual_hydrants (id,latitude,longitude,address,note,added_by,created_at)
  select id,latitude,longitude,address,note,added_by,created_at from public.manual_hydrants;

  update public.app_settings
  set value = value + 1, updated_at = now()
  where key = 'map_data_version'
  returning value into next_version;

  if next_version is null then
    insert into public.app_settings(key,value) values ('map_data_version',2)
    returning value into next_version;
  end if;

  return next_version;
end;
$$;

revoke all on function public.publish_map_data() from public;
grant execute on function public.publish_map_data() to authenticated;
