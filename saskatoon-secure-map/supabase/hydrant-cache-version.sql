-- Run this ONCE in Supabase -> SQL Editor.
-- It stores one tiny version number used to tell every device when an admin
-- has published a manual-hydrant update.

create table if not exists public.app_settings (
  key text primary key,
  value bigint not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('hydrant_data_version', 1)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

-- The browser never reads/writes this table directly. The protected Next.js
-- API/server actions do it using the signed-in user's Supabase session.
drop policy if exists "Approved users can read app settings" on public.app_settings;
create policy "Approved users can read app settings"
on public.app_settings
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.blocked = false
      and (p.approved = true or p.is_admin = true)
  )
);

drop policy if exists "Admins can update app settings" on public.app_settings;
create policy "Admins can update app settings"
on public.app_settings
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true and p.blocked = false
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true and p.blocked = false
  )
);

grant select, update on table public.app_settings to authenticated;
