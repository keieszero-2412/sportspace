-- Imported public timetable tables have RLS enabled but no SELECT policies.
-- No client write policies are added. Private bookings and users stay protected.
begin;
grant select on public."Courts", public."Availability" to anon, authenticated;
drop policy if exists "Public court catalogue" on public."Courts";
create policy "Public court catalogue" on public."Courts"
  for select to anon, authenticated using (true);
drop policy if exists "Public court timetable" on public."Availability";
create policy "Public court timetable" on public."Availability"
  for select to anon, authenticated using (true);
commit;
