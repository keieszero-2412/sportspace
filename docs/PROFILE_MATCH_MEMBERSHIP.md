# Joined matchmaking in profile

- `UserProfileModal` subscribes to the user's matches when opened, independently
  of the selected tab. The Matches tab and its count receive realtime updates.
- `profileData` filters membership server-side in either `joinedUsers` or
  `raw_data.joinedUsers`. Only a specifically missing promoted membership column
  triggers a logged JSON-only compatibility retry. Permission errors remain errors.
- Match flattening follows the public match feed's JSON precedence and preserves
  the database row ID. Imported null/default promoted fields cannot hide details.
- Profile cards show date/time and Host/Joined roles. Booking and credibility
  queries, join/leave API operations, and the public loading cache are unchanged.
- `20261011000000_profile_match_membership.sql` adds SELECT access only for an
  authenticated member's own matches, including cancelled/closed matches; the
  existing public-open policy remains unchanged. This migration is prepared only,
  not applied. Production closed-match visibility requires its deployment.

Verification uses mocked HTTP and realtime clients only. No live database reads,
Firebase operations, migrations, seed execution or deployment were performed.
SQL policy behavior has not been exercised against a running PostgreSQL instance.
