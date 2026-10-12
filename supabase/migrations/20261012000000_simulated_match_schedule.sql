begin;

-- Deliberately separate from financial Bookings: no payer, deposit or receipt.
create table if not exists public."SimulationMatchTemplates" (
  id text primary key, data jsonb not null
);
create table if not exists public."SimulatedBookings" (
  id text primary key, "matchId" text unique not null,
  "facilityId" text not null, "courtId" text not null,
  date text not null, "startAt" bigint not null, "endAt" bigint not null,
  status text not null default 'simulated', "createdAt" timestamptz not null default now(),
  check ("endAt" > "startAt")
);
alter table public."SimulationMatchTemplates" enable row level security;
alter table public."SimulatedBookings" enable row level security;
revoke all on public."SimulationMatchTemplates", public."SimulatedBookings" from anon, authenticated;
grant all on public."SimulationMatchTemplates", public."SimulatedBookings" to service_role;

-- Capture only explicitly seeded records, never real matches or user accounts.
insert into public."SimulationMatchTemplates" (id,data)
select id,to_jsonb(m) from public."Matches" m
where id like 'mock-match-%' and raw_data->>'mockData'='true'
  and raw_data->>'seedVersion'='2'
  and coalesce(raw_data->>'simulationManaged','false') <> 'true'
  and "courtId" is not null and "venueId" is not null
  and "endAt">"startAt"
on conflict (id) do nothing;

create or replace function public.refresh_simulated_match_schedule()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  epoch_now bigint := floor(extract(epoch from clock_timestamp())*1000);
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  t record; m record; r public."Matches"%rowtype;
  target_day date; shift_days integer; starts bigint; ends bigint;
  next_id text; booking_id text; slot_id text; payload jsonb;
  new_matches integer := 0; new_bookings integer := 0; conflicts integer := 0;
begin
  -- Prevent concurrent hourly/manual runs. Court locks also serialize real holds.
  if not pg_try_advisory_xact_lock(120102026) then
    return jsonb_build_object('skipped','already-running');
  end if;
  -- Recur the 20-day seed schedule, filling a seven-day horizon idempotently.
  for t in select id,data from public."SimulationMatchTemplates" order by id loop
    target_day := (t.data->>'date')::date;
    if target_day<today then
      target_day := target_day + (((today-target_day+19)/20)*20);
    end if;
    if target_day>=today+7 or target_day=(t.data->>'date')::date then continue; end if;
    shift_days := target_day-(t.data->>'date')::date;
    starts := (t.data->>'startAt')::bigint + shift_days::bigint*86400000;
    ends := (t.data->>'endAt')::bigint + shift_days::bigint*86400000;
    if starts<=epoch_now then continue; end if;
    next_id := 'mock-rolling-'||target_day::text||'-'||t.id;
    if exists(select 1 from public."Matches" where id=next_id) then continue; end if;
    perform 1 from public."Courts" where id=t.data->>'courtId' for update;
    if not found then continue; end if;
    if exists(select 1 from public."Availability" a
      where coalesce(a."courtId",a.court_id)=t.data->>'courtId'
        and lower(coalesce(a.status,'')) not in ('available','expired','cancelled','rejected')
        and (a."expiresAt" is null or a."expiresAt">epoch_now)
        and a."startAt"<ends and a."endAt">starts) then
      conflicts:=conflicts+1; continue;
    end if;
    booking_id := 'SIM-'||next_id;
    payload := t.data || jsonb_build_object('id',next_id,'date',target_day::text,
      'title',t.data->>'sport','startAt',starts,'endAt',ends,'createdAt',epoch_now,
      'updatedAt',epoch_now,'status','open');
    payload := payload || jsonb_build_object('raw_data',
      coalesce(t.data->'raw_data','{}'::jsonb) || (payload-'raw_data') ||
      jsonb_build_object('mockData',true,'simulationManaged',true,'simulationTemplateId',t.id,
        'bookingId',booking_id,'reservationStatus','confirmed'));
    r := jsonb_populate_record(null::public."Matches",payload);
    insert into public."Matches" select (r).*;
    new_matches:=new_matches+1;
  end loop;

  -- Backfill existing seeded matches as well as newly generated matches.
  for m in select * from public."Matches"
    where raw_data->>'mockData'='true' and raw_data->>'seedVersion'='2'
      and raw_data->>'reservationStatus'='confirmed'
      and status='open' and "startAt">epoch_now and "endAt">"startAt"
      and "venueId" is not null and "courtId" is not null
      and not exists(select 1 from public."SimulatedBookings" b where b."matchId"="Matches".id)
    order by "startAt",id loop
    perform 1 from public."Courts" where id=m."courtId" and facility_id=m."venueId" for update;
    if not found then continue; end if;
    if exists(select 1 from public."Availability" a
      where coalesce(a."courtId",a.court_id)=m."courtId"
        and lower(coalesce(a.status,'')) not in ('available','expired','cancelled','rejected')
        and (a."expiresAt" is null or a."expiresAt">epoch_now)
        and a."startAt"<m."endAt" and a."endAt">m."startAt") then
      conflicts:=conflicts+1; continue;
    end if;
    booking_id := 'SIM-'||m.id;
    slot_id := 'SIM-AVAIL-'||m.id;
    insert into public."SimulatedBookings" (id,"matchId","facilityId","courtId",date,"startAt","endAt")
      values(booking_id,m.id,m."venueId",m."courtId",m.date,m."startAt",m."endAt");
    insert into public."Availability"
      (id,court_id,"courtId",facility_id,"facilityId",booking_id,"bookingId",date,
       start_time,end_time,"startAt","endAt","expiresAt",status,raw_data)
      values(slot_id,m."courtId",m."courtId",m."venueId",m."venueId",booking_id,booking_id,m.date,
        to_char(to_timestamp(m."startAt"/1000.0) at time zone 'Asia/Ho_Chi_Minh','HH24:MI'),
        to_char(to_timestamp(m."endAt"/1000.0) at time zone 'Asia/Ho_Chi_Minh','HH24:MI'),
        m."startAt",m."endAt",m."endAt",'booked',
        jsonb_build_object('mockData',true,'simulationManaged',true,'matchId',m.id));
    -- Keep the link consistent without replacing membership or other metadata.
    update public."Matches" set raw_data=raw_data||jsonb_build_object('bookingId',booking_id)
      where id=m.id;
    new_bookings:=new_bookings+1;
  end loop;

  -- Expire only managed simulations; retain history, never delete records.
  update public."Availability" set status='expired'
    where raw_data->>'simulationManaged'='true' and "endAt"<=epoch_now and status='booked';
  update public."SimulatedBookings" set status='expired' where "endAt"<=epoch_now and status='simulated';
  update public."Availability" a set status='cancelled'
    from public."Matches" linked where a.raw_data->>'simulationManaged'='true'
      and a.raw_data->>'matchId'=linked.id and linked.status='cancelled' and a.status='booked';
  update public."SimulatedBookings" b set status='cancelled'
    from public."Matches" linked where b."matchId"=linked.id and linked.status='cancelled' and b.status='simulated';
  return jsonb_build_object('newMatches',new_matches,'newSimulatedBookings',new_bookings,'conflictsSkipped',conflicts);
end;
$$;
revoke all on function public.refresh_simulated_match_schedule() from public,anon,authenticated;
grant execute on function public.refresh_simulated_match_schedule() to service_role;

-- Keep cancellation/editing of a linked simulated match atomic with its slots.
-- Membership changes do not enter this trigger or modify reservations.
create or replace function public.sync_simulated_match_reservation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  booking public."SimulatedBookings"%rowtype;
  epoch_now bigint := floor(extract(epoch from clock_timestamp())*1000);
  next_status text;
begin
  if (new."courtId",new."venueId",new.date,new."startAt",new."endAt",new.status)
    is not distinct from (old."courtId",old."venueId",old.date,old."startAt",old."endAt",old.status)
    then return new; end if;
  select * into booking from public."SimulatedBookings" where "matchId"=new.id for update;
  if not found then return new; end if;
  next_status := case when new.status<>'open' then 'cancelled'
    when new."endAt"<=epoch_now then 'expired' else 'simulated' end;
  if next_status='simulated' then
    perform 1 from public."Courts" where id=new."courtId" and facility_id=new."venueId" for update;
    if not found or new."endAt"<=new."startAt" then raise exception 'invalid-match'; end if;
    if exists(select 1 from public."Availability" a
      where coalesce(a."courtId",a.court_id)=new."courtId"
        and coalesce(a."bookingId",a.booking_id,'')<>booking.id
        and lower(coalesce(a.status,'')) not in ('available','expired','cancelled','rejected')
        and (a."expiresAt" is null or a."expiresAt">epoch_now)
        and a."startAt"<new."endAt" and a."endAt">new."startAt")
      then raise exception 'slot-taken'; end if;
  end if;
  update public."SimulatedBookings" set "courtId"=new."courtId","facilityId"=new."venueId",
    date=new.date,"startAt"=new."startAt","endAt"=new."endAt",status=next_status where id=booking.id;
  update public."Availability" set court_id=new."courtId","courtId"=new."courtId",
    facility_id=new."venueId","facilityId"=new."venueId",date=new.date,
    "startAt"=new."startAt","endAt"=new."endAt","expiresAt"=new."endAt",
    start_time=to_char(to_timestamp(new."startAt"/1000.0) at time zone 'Asia/Ho_Chi_Minh','HH24:MI'),
    end_time=to_char(to_timestamp(new."endAt"/1000.0) at time zone 'Asia/Ho_Chi_Minh','HH24:MI'),
    status=case when next_status='simulated' then 'booked' else next_status end
    where "bookingId"=booking.id and raw_data->>'simulationManaged'='true';
  return new;
end;
$$;
revoke all on function public.sync_simulated_match_reservation() from public,anon,authenticated;
drop trigger if exists sync_simulated_match_reservation on public."Matches";
create trigger sync_simulated_match_reservation
  after update of "courtId","venueId",date,"startAt","endAt",status on public."Matches"
  for each row execute function public.sync_simulated_match_reservation();

create extension if not exists pg_cron;
select cron.schedule('sportspace-simulated-match-schedule','5 * * * *',
  'select public.refresh_simulated_match_schedule();');
commit;
