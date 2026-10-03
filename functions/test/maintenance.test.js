import test from "node:test";
import assert from "node:assert/strict";
import { cleanOrphanCourtPhotos } from "../maintenance.js";

test("photo cleanup retains referenced and recent files and deletes only old generated orphans", async () => {
  const now = Date.parse("2026-10-03T00:00:00Z"),
    deleted = [];
  const names = [
    "court_photos/owner/used",
    "court_photos/owner/recent",
    "court_photos/owner/orphan",
    "court_photos/owner/nested/untouched",
  ];
  const files = names.map((name) => ({
    name,
    getMetadata: async () => [
      {
        timeCreated: new Date(
          now - (name.endsWith("recent") ? 3600000 : 2 * 86400000),
        ).toISOString(),
        generation: "10",
      },
    ],
    delete: async (options) => {
      assert.equal(options.ifGenerationMatch, "10");
      deleted.push(name);
    },
  }));
  const db = {
    collection: () => ({
      select: () => ({
        get: async () => ({
          docs: [
            {
              data: () => ({
                imageUrl:
                  "https://firebasestorage.googleapis.com/v0/b/demo/o/court_photos%2Fowner%2Fused?alt=media",
              }),
            },
          ],
        }),
      }),
    }),
  };
  const bucket = {
    getFilesStream: async function* ({ prefix }) {
      assert.equal(prefix, "court_photos/");
      yield* files;
    },
  };
  await cleanOrphanCourtPhotos(db, bucket, now);
  assert.deepEqual(deleted, ["court_photos/owner/orphan"]);
});
