-- Run once in Supabase -> SQL Editor.
-- Private driven routes: each signed-in user can only read/write/delete their own rows.
create table if not exists public.driven_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  points jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists driven_routes_user_id_created_at_idx
  on public.driven_routes (user_id, created_at desc);

alter table public.driven_routes enable row level security;

drop policy if exists "Users read own driven routes" on public.driven_routes;
create policy "Users read own driven routes" on public.driven_routes
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users insert own driven routes" on public.driven_routes;
create policy "Users insert own driven routes" on public.driven_routes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users delete own driven routes" on public.driven_routes;
create policy "Users delete own driven routes" on public.driven_routes
  for delete to authenticated using (auth.uid() = user_id);

grant select, insert, delete on table public.driven_routes to authenticated;
