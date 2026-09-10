-- Run this ONCE in the Supabase SQL Editor.
-- Saves each user's unfinished drive so it can be recovered after closing/reopening the site.

create table if not exists public.drive_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'recording' check (state in ('recording', 'completed')),
  mode text not null default 'newroute' check (mode in ('casual', 'route', 'newroute')),
  segments jsonb not null default '[]'::jsonb,
  selected_route_value text not null default '',
  paused boolean not null default false,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drive_drafts enable row level security;

drop policy if exists "users read own drive draft" on public.drive_drafts;
create policy "users read own drive draft"
on public.drive_drafts for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users insert own drive draft" on public.drive_drafts;
create policy "users insert own drive draft"
on public.drive_drafts for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users update own drive draft" on public.drive_drafts;
create policy "users update own drive draft"
on public.drive_drafts for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users delete own drive draft" on public.drive_drafts;
create policy "users delete own drive draft"
on public.drive_drafts for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.drive_drafts to authenticated;
