create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  approved boolean not null default false,
  is_admin boolean not null default false,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,email,full_name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','')) on conflict(id) do nothing;
  return new;
end;$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and is_admin=true); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
drop policy if exists "read own profile or admin" on public.profiles;
create policy "read own profile or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());

-- After creating your own account, make yourself admin:
-- update public.profiles set approved=true,is_admin=true where email='YOUR_EMAIL_HERE';


-- ==========================================================
-- GPX ROUTE MANAGER
-- ==========================================================

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
      and p.blocked = false
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
