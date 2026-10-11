# Local data moved to Supabase

Project: `dzpbnvpqkwsjlvdxwwub`.
Archive: `1b0e806d-79c5-43ce-8e96-c2470ce167f4`.

Canonical app data remains in Supabase. All IDs in the six local collection
exports already existed there; older exports were not used to overwrite newer
records. Existing venue review approvals also matched current canonical values.

`public.VenueReviewCatalog` contains all collected phone, image and reference
price candidates and their evidence. Only admins can read it. Candidates remain
unapproved until the admin approves them. The app loads the catalog once per
admin session, not after each approval. Public catalogue and booking data come
from Supabase without importing the old local venue list.

The original files under `src/data`, `docs/data`, `data_export`, plus
`functions/courts_prices.csv`, are backed up in the private
`sportspace_archive.manifests` and `sportspace_archive.parts` tables. They are
not exposed through the app API to anonymous or ordinary authenticated users.
7,015 files / 1,024,510,954 original bytes are stored as 83 compressed parts
(236,145,091 bytes). Every part and original file has a SHA-256 checksum.

`docs/local-data-sync-manifest.json` becomes a compact recovery receipt after
cleanup: counts, verification status and archive ID, not original file contents.
The complete file inventory and checksums remain private on Supabase.

Recovery (requires the authorized Supabase DB connection in `.env`):

```powershell
node scripts/restore-supabase-local-archive.mjs --restore --archive=1b0e806d-79c5-43ce-8e96-c2470ce167f4 --prefix=src/data/
```

Omit `--prefix` to restore the entire archive. Recovery refuses to overwrite
existing files and verifies checksums. Historical offline research/import tools
may require explicit recovery of their inputs before use. They must not be run
against Firebase without new, specific authorization.

Secrets, `.env`, Firebase service-account keys, source code and synthetic test
fixtures are not part of the migrated data set and are not removed. No Firebase
service was accessed during this migration. Frontend changes need deployment
before affecting the hosted website.
