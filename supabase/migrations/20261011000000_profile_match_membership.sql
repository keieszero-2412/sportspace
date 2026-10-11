begin;

-- Additive policy: keep public discovery unchanged while members retain access
-- to their own closed/cancelled matches. Never exposes another user's history.
drop policy if exists "Members view their matchmaking" on public."Matches";
create policy "Members view their matchmaking" on public."Matches"
  for select to authenticated using (
    "joinedUsers" @> jsonb_build_array(auth.uid()::text)
    or (raw_data -> 'joinedUsers') @> jsonb_build_array(auth.uid()::text)
  );

commit;
