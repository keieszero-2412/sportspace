begin;

-- Coverage-only reservations have no participant list or financial booking.
-- Existing match-linked reservations retain their unique non-null matchId.
alter table public."SimulatedBookings" alter column "matchId" drop not null;

-- Promote existing imported opening hours only when the public field is null.
-- No invented/default hours: booking needs actual valid opening bounds.
update public."Facilities" set operating_hours=to_jsonb(raw_data->>'operating_hours')
  where (operating_hours is null or operating_hours='null'::jsonb)
    and raw_data->>'operating_hours' ~ '^[[:space:]]*[0-2][0-9]:[0-5][0-9][[:space:]]*[-–—][[:space:]]*[0-2][0-9]:[0-5][0-9][[:space:]]*$';

create or replace function public.refresh_simulated_venue_coverage()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  epoch_now bigint := floor(extract(epoch from clock_timestamp())*1000);
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  f record; c record; candidate record; d date; offset_day integer;
  bounds text[]; start_min integer; end_min integer;
  starts bigint; ends bigint; target_count integer; current_count integer;
  booking_id text; new_count integer := 0; invalid_hours integer := 0;
begin
  -- Serialize both generators; court locks serialize actual hold requests.
  if not pg_try_advisory_xact_lock(120102026) then
    return jsonb_build_object('skipped','already-running');
  end if;
  for f in select id,operating_hours #>> '{}' as operating_hours from public."Facilities"
    where coalesce(status,'active') not in ('archived','inactive','maintenance') order by id loop
    if coalesce(f.operating_hours,'') !~ '^[[:space:]]*[0-2][0-9]:[0-5][0-9][[:space:]]*[-–—][[:space:]]*[0-2][0-9]:[0-5][0-9][[:space:]]*$' then
      invalid_hours:=invalid_hours+1; continue;
    end if;
    bounds:=regexp_split_to_array(trim(f.operating_hours),'[[:space:]]*[-–—][[:space:]]*');
    start_min:=split_part(bounds[1],':',1)::integer*60+split_part(bounds[1],':',2)::integer;
    end_min:=split_part(bounds[2],':',1)::integer*60+split_part(bounds[2],':',2)::integer;
    if start_min>=1440 or end_min>1440 then invalid_hours:=invalid_hours+1; continue; end if;
    if end_min<=start_min then end_min:=end_min+1440; end if;
    for offset_day in 0..6 loop
      d:=today+offset_day;
      target_count:=case when extract(isodow from d) in (6,7) then 2 else 1 end;
      -- Count historical coverage too: don't fill the entire day as time passes.
      select count(*) into current_count from public."SimulatedBookings"
        where "facilityId"=f.id and date=d::text and id like 'SIM-COVERAGE-%';
      if current_count>=target_count then continue; end if;
      -- Prefer peak hours, spread fixtures reproducibly, obey 30-minute grid.
      for candidate in select value as minute from generate_series(((start_min+29)/30)*30,end_min-60,30) value
        order by case when value%1440 between 1020 and 1199 then 0 else 1 end,
          md5(f.id||d::text||value::text) loop
        starts:=floor(extract(epoch from (d::timestamp at time zone 'Asia/Ho_Chi_Minh'))*1000)
          +candidate.minute::bigint*60000;
        ends:=starts+3600000;
        if starts<=epoch_now then continue; end if;
        booking_id:='SIM-COVERAGE-'||f.id||'-'||d::text||'-'||candidate.minute::text;
        if exists(select 1 from public."SimulatedBookings" where id=booking_id) then continue; end if;
        for c in select id from public."Courts"
          where facility_id=f.id and is_available is distinct from false
            and (status in ('active','Đang hoạt động') or (status is null and is_available=true))
          order by md5(id||d::text) loop
          perform 1 from public."Courts" where id=c.id for update;
          if exists(select 1 from public."Availability" a
            where coalesce(a."courtId",a.court_id)=c.id and a.date=d::text
              and lower(coalesce(a.status,'')) not in ('available','expired','cancelled','rejected')
              and (a."expiresAt" is null or a."expiresAt">epoch_now)
              and coalesce(a."startAt",floor(extract(epoch from
                ((a.date||' '||a.start_time)::timestamp at time zone 'Asia/Ho_Chi_Minh'))*1000))<ends
              and coalesce(a."endAt",floor(extract(epoch from
                ((a.date||' '||a.end_time)::timestamp at time zone 'Asia/Ho_Chi_Minh'))*1000))>starts)
            then continue; end if;
          insert into public."SimulatedBookings" (id,"matchId","facilityId","courtId",date,"startAt","endAt")
            values(booking_id,null,f.id,c.id,d::text,starts,ends);
          insert into public."Availability"
            (id,court_id,"courtId",facility_id,"facilityId",booking_id,"bookingId",date,
             start_time,end_time,"startAt","endAt","expiresAt",status,raw_data)
            values('AVAIL-'||booking_id,c.id,c.id,f.id,f.id,booking_id,booking_id,d::text,
              to_char(to_timestamp(starts/1000.0) at time zone 'Asia/Ho_Chi_Minh','HH24:MI'),
              to_char(to_timestamp(ends/1000.0) at time zone 'Asia/Ho_Chi_Minh','HH24:MI'),
              starts,ends,ends,'booked',jsonb_build_object('mockData',true,'simulationManaged',true,
                'simulationCoverage',true));
          new_count:=new_count+1;current_count:=current_count+1;
          exit;
        end loop;
        if current_count>=target_count then exit; end if;
      end loop;
    end loop;
  end loop;
  update public."Availability" set status='expired'
    where raw_data->>'simulationCoverage'='true' and "endAt"<=epoch_now and status='booked';
  update public."SimulatedBookings" set status='expired'
    where id like 'SIM-COVERAGE-%' and "endAt"<=epoch_now and status='simulated';
  return jsonb_build_object('newSimulatedBookings',new_count,'invalidOperatingHours',invalid_hours);
end;
$$;
revoke all on function public.refresh_simulated_venue_coverage() from public,anon,authenticated;
grant execute on function public.refresh_simulated_venue_coverage() to service_role;
create index if not exists simulated_bookings_facility_date_idx on public."SimulatedBookings" ("facilityId",date);
select cron.schedule('sportspace-simulated-venue-coverage','15 * * * *',
  'select public.refresh_simulated_venue_coverage();');
commit;
