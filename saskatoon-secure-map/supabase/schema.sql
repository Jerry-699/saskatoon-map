-- Saskatoon Block Finder base schema. Run once on a fresh Supabase project.
create extension if not exists pgcrypto;

do $$ begin
  create type public.user_status as enum ('pending','approved','blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_role as enum ('user','admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status public.user_status not null default 'pending',
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email) values(new.id,coalesce(new.email,''))
  on conflict(id) do update set email=excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_approved(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=uid and p.status='approved');
$$;
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=uid and p.status='approved' and p.role='admin');
$$;
revoke all on function public.is_approved(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_approved(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (id=auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create table if not exists public.routes (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(name) between 1 and 120),
 geojson jsonb not null,
 sort_order integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.routes enable row level security;
drop policy if exists routes_read on public.routes;
create policy routes_read on public.routes for select to authenticated using(public.is_approved());
drop policy if exists routes_admin_insert on public.routes;
create policy routes_admin_insert on public.routes for insert to authenticated with check(public.is_admin());
drop policy if exists routes_admin_update on public.routes;
create policy routes_admin_update on public.routes for update to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists routes_admin_delete on public.routes;
create policy routes_admin_delete on public.routes for delete to authenticated using(public.is_admin());

create table if not exists public.manual_hydrants (
 id uuid primary key default gen_random_uuid(),
 lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.manual_hydrants enable row level security;
drop policy if exists manual_hydrants_read on public.manual_hydrants;
create policy manual_hydrants_read on public.manual_hydrants for select to authenticated using(public.is_approved());
drop policy if exists manual_hydrants_admin_insert on public.manual_hydrants;
create policy manual_hydrants_admin_insert on public.manual_hydrants for insert to authenticated with check(public.is_admin());
drop policy if exists manual_hydrants_admin_delete on public.manual_hydrants;
create policy manual_hydrants_admin_delete on public.manual_hydrants for delete to authenticated using(public.is_admin());

-- After your own account signs up, promote it ONCE in SQL Editor:
-- update public.profiles set role='admin', status='approved' where email='YOUR_EMAIL@example.com';
