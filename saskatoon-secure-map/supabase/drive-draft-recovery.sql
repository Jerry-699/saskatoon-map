-- Run once. One crash/close-resistant recording draft per signed-in user.
create table if not exists public.drive_drafts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 draft jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.drive_drafts enable row level security;
drop policy if exists drive_drafts_owner_select on public.drive_drafts;
create policy drive_drafts_owner_select on public.drive_drafts for select to authenticated using(user_id=auth.uid() and public.is_approved());
drop policy if exists drive_drafts_owner_insert on public.drive_drafts;
create policy drive_drafts_owner_insert on public.drive_drafts for insert to authenticated with check(user_id=auth.uid() and public.is_approved());
drop policy if exists drive_drafts_owner_update on public.drive_drafts;
create policy drive_drafts_owner_update on public.drive_drafts for update to authenticated using(user_id=auth.uid() and public.is_approved()) with check(user_id=auth.uid() and public.is_approved());
drop policy if exists drive_drafts_owner_delete on public.drive_drafts;
create policy drive_drafts_owner_delete on public.drive_drafts for delete to authenticated using(user_id=auth.uid() and public.is_approved());
