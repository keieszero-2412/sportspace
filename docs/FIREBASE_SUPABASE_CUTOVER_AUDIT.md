# Firebase → Supabase: local cutover audit

Audit date: 2026-10-11. Initial findings used local files only. The user then
explicitly authorized the scoped live read-only verification below. No writes,
deployment, migration, object downloads or service disabling were performed.

## Authorized live verification — 2026-10-11, 00:17–00:18 Asia/Bangkok

Source `sportspace-af6b4`; target `dzpbnvpqkwsjlvdxwwub`.

| Collection | Firebase | Supabase | Missing source IDs | Exact source fields in target raw_data |
| --- | ---: | ---: | ---: | ---: |
| Users | 2603 | 2607 | 0 | 2603 |
| Facilities | 1912 | 1912 | 0 | 1131 |
| Courts | 7377 | 7377 | 0 | 7377 |
| Availability | 6801 | 6801 | 0 | 6801 |
| Matches | 8 | 408 | 0 | 8 |
| PricingRules | 400 | 400 | 0 | 400 |

All 19101 source documents have matching target IDs. Source fields were compared
against imported `raw_data`; additional target fields were not treated as errors.
781 Facilities differ only in the source `image` field. This audit did not establish
which image version is preferred and did not overwrite those differences.
Supabase contains 4 additional Users and 400 additional Matches. Only the six
approved top-level collections were found; subcollections were not inspected.

Auth metadata: Firebase has 2 accounts; Supabase has 7. Both source emails occur
in Supabase, but none share their Firebase UID. Email presence does not establish
correct profile, booking, host/member or ownership identity mapping. No password
hash/salt was requested (the Auth API used an explicit metadata field mask).

Storage metadata: the source project bucket-list API returned 0 buckets and the
target `storage.buckets` query returned 0 rows. No object downloads or content
comparison occurred. This also leaves the application's expected `sportspace`
and `sportspace-receipts` target buckets unverified/unavailable in that inventory.

Cloud Functions v1/v2 and Cloud Scheduler in `asia-southeast1` all returned HTTP
403. Consequently, deployed function/job state is unknown, not confirmed empty.
No IAM permissions were modified and no jobs were disabled.

### Current decision

The six top-level Firestore collections are present by ID, but full-system cutover
is **not yet verified**: identity mapping, subcollections, Storage readiness and
deployed Firebase writers/jobs remain unverified. Keep the already-Supabase
frontend unchanged; do not delete or disable Firebase services yet. Firebase is
a retained historical source, not a current backup of Supabase's newer records.

Audit script: `scripts/check-firebase-supabase-cutover.mjs`. It requires the explicit
`--authorized-read` flag, uses a read-only Postgres connection, outputs aggregate
results without credentials/emails/data values and was syntax-checked locally.
The first restricted-network attempt was interrupted before inventory returned;
the completed verification used approved network access. A flag does not replace
fresh operation-specific user authorization for future executions.

## Initial local-only findings (historical context)

## Local snapshot inventory

Snapshot files were last modified on 2026-10-04; they do not prove today's state.

| Export | Records |
| --- | ---: |
| Users | 2603 |
| Facilities | 1912 |
| Courts | 7377 |
| Availability | 6801 |
| Matches | 8 |
| PricingRules | 400 |
| Firebase Auth users | 1 |

The six collection exports contain 19101 records in total. No Firebase Storage
URL patterns were found in these root JSON exports. That does not establish that
the Firebase bucket is empty or that all objects were migrated.

## Findings

- Production frontend source imports Supabase for Auth, database, Edge Functions
  and uploads. No application caller of `src/firebase.js` was found; that module
  still exists, along with Firebase maintenance scripts and emulator tests.
- `scripts/import_supabase.cjs` imports only the six collections listed above. It
  does not import Firebase Auth accounts/passwords or Storage objects.
- The importer logs batch errors but continues and prints a completion message;
  that message cannot certify a successful or complete transfer.
- `scripts/extract_firebase.cjs` exports top-level collection documents and Auth;
  it does not recursively export subcollections or Storage objects.
- No current target snapshot or per-ID/content reconciliation report was found.
  Creating Supabase tables/migrations alone is not evidence of data migration.
- Firebase backend source still defines the callable `sportspace` and scheduled
  `cleanCourtPhotos` / `expireHolds`. Source does not reveal whether these jobs
  are deployed or enabled. A frontend cutover does not disable backend jobs.

## Cutover decision

**Not verified complete.** Do not delete Firebase data, remove backup tooling,
disable live services or assume Firebase Auth identities map to Supabase users.
Firebase currently being retained is a historical copy, not a verified current
backup of ongoing Supabase changes. No automatic backup sync was configured here.

Next verification requires explicit, operation-specific permission for Firebase
project `sportspace-af6b4`: collection inventory and documents in the six listed
collections; Auth account metadata (no password hashes); Storage object metadata
(no object downloads); and deployed function/scheduler configuration. Compare
with project `dzpbnvpqkwsjlvdxwwub` using read-only target records/metadata. Any
additional collections/subcollections require a separate scoped permission.
Only after reconciliation and an approved backup/restore plan should live Firebase
writers/jobs be disabled; disabling them requires separate authorization.
