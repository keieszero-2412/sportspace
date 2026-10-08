begin;

create table if not exists public."Matches" (id text primary key, raw_data jsonb not null default '{}'::jsonb);

alter table public."Matches"
  add column if not exists title text,
  add column if not exists sport text,
  add column if not exists province text,
  add column if not exists "venueId" text,
  add column if not exists "venueName" text,
  add column if not exists "courtId" text,
  add column if not exists "courtName" text,
  add column if not exists date text,
  add column if not exists time text,
  add column if not exists "startAt" bigint,
  add column if not exists "endAt" bigint,
  add column if not exists "levelRequired" text,
  add column if not exists "costPerPerson" numeric default 0,
  add column if not exists "playersMax" integer,
  add column if not exists "playersJoined" integer default 1,
  add column if not exists "joinedUsers" jsonb default '[]'::jsonb,
  add column if not exists "memberNames" jsonb default '{}'::jsonb,
  add column if not exists "hostId" text,
  add column if not exists "hostName" text,
  add column if not exists "hostCredibility" numeric,
  add column if not exists status text default 'open',
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists "createdAt" bigint,
  add column if not exists "updatedAt" bigint;

create index if not exists matches_open_start_idx on public."Matches" (status, "startAt");
create index if not exists matches_host_idx on public."Matches" ("hostId");
create index if not exists matches_joined_users_gin_idx on public."Matches" using gin ("joinedUsers");
create index if not exists matches_raw_joined_users_gin_idx on public."Matches" using gin ((raw_data -> 'joinedUsers'));

alter table public."Matches" enable row level security;
grant select on public."Matches" to anon, authenticated;
grant all on public."Matches" to service_role;
drop policy if exists "Public open matchmaking" on public."Matches";
create policy "Public open matchmaking" on public."Matches"
  for select to anon, authenticated using (status = 'open');

create or replace function public.match_transition(
  p_match_id text, p_actor_id text, p_actor_name text, p_operation text, p_now bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_match public."Matches"%rowtype;
  next_users jsonb;
  next_names jsonb;
  patch jsonb;
begin
  select * into current_match from public."Matches" where id = p_match_id for update;
  if not found then raise exception 'match-not-found'; end if;
  if current_match.status <> 'open' or current_match."startAt" <= p_now then raise exception 'match-closed'; end if;
  next_users := coalesce(current_match."joinedUsers", '[]'::jsonb);
  next_names := coalesce(current_match."memberNames", '{}'::jsonb);
  if p_operation = 'join' then
    if next_users ? p_actor_id then return '{}'::jsonb; end if;
    if jsonb_array_length(next_users) >= current_match."playersMax" then raise exception 'match-full'; end if;
    next_users := next_users || to_jsonb(p_actor_id);
    next_names := next_names || jsonb_build_object(p_actor_id, p_actor_name);
    patch := jsonb_build_object('joinedUsers', next_users, 'memberNames', next_names, 'playersJoined', jsonb_array_length(next_users), 'updatedAt', p_now);
  elsif p_operation = 'leave' then
    if current_match."hostId" = p_actor_id then raise exception 'host-must-cancel'; end if;
    select coalesce(jsonb_agg(value), '[]'::jsonb) into next_users
      from jsonb_array_elements(current_match."joinedUsers") value where value #>> '{}' <> p_actor_id;
    next_names := next_names - p_actor_id;
    patch := jsonb_build_object('joinedUsers', next_users, 'memberNames', next_names, 'playersJoined', jsonb_array_length(next_users), 'updatedAt', p_now);
  elsif p_operation = 'cancel' and current_match."hostId" = p_actor_id then
    patch := jsonb_build_object('status', 'cancelled', 'updatedAt', p_now);
  else
    raise exception 'not-match-host';
  end if;
  update public."Matches" set
    "joinedUsers" = coalesce(patch -> 'joinedUsers', "joinedUsers"),
    "memberNames" = coalesce(patch -> 'memberNames', "memberNames"),
    "playersJoined" = coalesce((patch ->> 'playersJoined')::integer, "playersJoined"),
    status = coalesce(patch ->> 'status', status),
    "updatedAt" = p_now,
    raw_data = raw_data || patch
  where id = p_match_id;
  return patch;
end;
$$;

revoke all on function public.match_transition(text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.match_transition(text, text, text, text, bigint) to service_role;
notify pgrst, 'reload schema';
commit;
