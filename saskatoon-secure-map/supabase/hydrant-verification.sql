-- Run this once in Supabase -> SQL Editor.
-- Adds unverified hydrant candidates and per-user verification responses.
-- A single YES confirmation promotes the candidate into manual_hydrants permanently.

create table if not exists public.hydrant_candidates (
  id uuid primary key default gen_random_uuid(),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text,
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed')),
  added_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.hydrant_candidate_responses (
  candidate_id uuid not null references public.hydrant_candidates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null check (response in ('no')),
  created_at timestamptz not null default now(),
  primary key (candidate_id, user_id)
);

alter table public.hydrant_candidates enable row level security;
alter table public.hydrant_candidate_responses enable row level security;

-- Approved users may see only pending candidates. The app additionally filters
-- candidates each user already answered NO to.
drop policy if exists "Approved users can read hydrant candidates" on public.hydrant_candidates;
create policy "Approved users can read hydrant candidates"
on public.hydrant_candidates
for select
to authenticated
using (
  status = 'pending'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.blocked = false
      and (p.approved = true or p.is_admin = true)
  )
);

-- Admins create/delete candidate points.
drop policy if exists "Admins can add hydrant candidates" on public.hydrant_candidates;
create policy "Admins can add hydrant candidates"
on public.hydrant_candidates
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true and p.blocked = false
  )
);

drop policy if exists "Admins can delete hydrant candidates" on public.hydrant_candidates;
create policy "Admins can delete hydrant candidates"
on public.hydrant_candidates
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true and p.blocked = false
  )
);

-- Users can read/write only their own NO response.
drop policy if exists "Users can read own hydrant responses" on public.hydrant_candidate_responses;
create policy "Users can read own hydrant responses"
on public.hydrant_candidate_responses
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can add own hydrant responses" on public.hydrant_candidate_responses;
create policy "Users can add own hydrant responses"
on public.hydrant_candidate_responses
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.blocked = false
      and (p.approved = true or p.is_admin = true)
  )
);

drop policy if exists "Users can update own hydrant responses" on public.hydrant_candidate_responses;
create policy "Users can update own hydrant responses"
on public.hydrant_candidate_responses
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Confirming a candidate must be atomic because normal users are not allowed to
-- insert arbitrary permanent hydrants. This SECURITY DEFINER function checks
-- that the caller is an approved, unblocked user and that the candidate is
-- still pending, then promotes it exactly once.
create or replace function public.confirm_hydrant_candidate(candidate uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.hydrant_candidates%rowtype;
  permanent_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.blocked = false
      and (p.approved = true or p.is_admin = true)
  ) then
    raise exception 'Access denied';
  end if;

  select * into c
  from public.hydrant_candidates
  where id = candidate and status = 'pending'
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'already_confirmed', true);
  end if;

  insert into public.manual_hydrants (
    latitude,
    longitude,
    address,
    note,
    added_by
  ) values (
    c.latitude,
    c.longitude,
    c.address,
    concat_ws(' • ', nullif(c.note, ''), 'Confirmed by an approved user'),
    c.added_by
  )
  returning id into permanent_id;

  update public.hydrant_candidates
  set status = 'confirmed',
      confirmed_by = auth.uid(),
      confirmed_at = now()
  where id = c.id;

  return jsonb_build_object('ok', true, 'manual_hydrant_id', permanent_id);
end;
$$;

revoke all on function public.confirm_hydrant_candidate(uuid) from public;
grant execute on function public.confirm_hydrant_candidate(uuid) to authenticated;

-- A NO answer is also final. It marks the candidate rejected globally so it
-- disappears for every user and nobody else will be asked about it.
create or replace function public.reject_hydrant_candidate(candidate uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.blocked = false
      and (p.approved = true or p.is_admin = true)
  ) then
    raise exception 'Access denied';
  end if;

  update public.hydrant_candidates
  set status = 'rejected'
  where id = candidate and status = 'pending';

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.reject_hydrant_candidate(uuid) from public;
grant execute on function public.reject_hydrant_candidate(uuid) to authenticated;

grant select, insert, delete on table public.hydrant_candidates to authenticated;
grant select, insert, update on table public.hydrant_candidate_responses to authenticated;
