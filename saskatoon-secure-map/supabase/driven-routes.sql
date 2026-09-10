-- Run once. Private saved driven routes; owner only.
create table if not exists public.driven_routes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 name text not null check(char_length(name) between 1 and 120),
 segments jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.driven_routes enable row level security;
drop policy if exists driven_routes_owner_select on public.driven_routes;
create policy driven_routes_owner_select on public.driven_routes for select to authenticated using(user_id=auth.uid() and public.is_approved());
drop policy if exists driven_routes_owner_insert on public.driven_routes;
create policy driven_routes_owner_insert on public.driven_routes for insert to authenticated with check(user_id=auth.uid() and public.is_approved());
drop policy if exists driven_routes_owner_delete on public.driven_routes;
create policy driven_routes_owner_delete on public.driven_routes for delete to authenticated using(user_id=auth.uid() and public.is_approved());
create index if not exists driven_routes_user_created_idx on public.driven_routes(user_id,created_at desc);
