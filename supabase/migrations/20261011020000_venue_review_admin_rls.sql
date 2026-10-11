begin;
-- Users can be hidden by its existing RLS. Check only caller's admin role through
-- a narrowly scoped definer helper, without changing Users policies or grants.
create or replace function public.venue_review_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public."Users" u
    where u.id = auth.uid()::text and coalesce(u.role,u.raw_data->>'role')='admin');
$$;
revoke all on function public.venue_review_is_admin() from public, anon;
grant execute on function public.venue_review_is_admin() to authenticated;
drop policy if exists "Admins read venue review history" on public."VenueDataReviews";
create policy "Admins read venue review history" on public."VenueDataReviews"
  for select to authenticated using (public.venue_review_is_admin());
notify pgrst, 'reload schema';
commit;
