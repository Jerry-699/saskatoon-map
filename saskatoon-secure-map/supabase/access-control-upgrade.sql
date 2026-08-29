-- Run this ONCE in Supabase SQL Editor on an existing project.
-- It adds a permanent Block / Deny Access state to user profiles.

alter table public.profiles
  add column if not exists blocked boolean not null default false;

-- Blocked users must not be able to read shared GPX routes even if approved was left true.
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
