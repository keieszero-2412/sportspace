import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname } from "node:path";

// Offline and read-only: accepts a reviewed data export, never opens credentials or connects to Firebase.
const args = process.argv.slice(2),
  value = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--input"))
  throw new Error(
    "Usage: node scripts/audit-data.mjs --input data_export/snapshot.json --output data_export/audit.json",
  );
if (args.includes("--apply"))
  throw new Error(
    "This tool is dry-run only. Review findings before any migration.",
  );
const input = JSON.parse(await readFile(resolve(value("--input")), "utf8"));
if (input.private_key || input.type === "service_account")
  throw new Error("Input must be a data export, never a service account.");
const collections = ["Facilities", "Courts", "Bookings", "Matches", "Users"];
for (const name of collections)
  if (!Array.isArray(input[name]))
    throw new Error(`Missing ${name} array; expected [{id,data}].`);
const rows = (name) => input[name].map((r) => ({ id: r.id, ...r.data }));
const facilities = rows("Facilities"),
  users = new Map(rows("Users").map((r) => [r.id, r]));
const aliases = new Map();
for (const f of facilities) {
  for (const alias of [f.id, f.facility_id].filter(Boolean)) {
    const list = aliases.get(alias) || [];
    aliases.set(alias, [...new Set([...list, f.id])]);
  }
}
const issues = [],
  proposals = [];
const issue = (collection, id, code) => issues.push({ collection, id, code });
for (const f of facilities) {
  if (!f.ownerId || users.get(f.ownerId)?.role !== "merchant")
    issue("Facilities", f.id, "owner-verification-required");
  if (!/^\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}$/.test(f.operating_hours || ""))
    issue("Facilities", f.id, "operating-hours-required");
  if (
    ["bank", "bankAccount", "bankOwner", "bankName"].some((k) => f[k] != null)
  )
    issue("Facilities", f.id, "move-private-bank-data-before-public-read");
}
for (const c of rows("Courts")) {
  const targets = aliases.get(c.facilityId || c.facility_id) || [];
  if (targets.length !== 1) issue("Courts", c.id, "ambiguous-facility");
  else if (c.facilityId !== targets[0])
    proposals.push({
      collection: "Courts",
      id: c.id,
      patch: { facilityId: targets[0] },
      reason: "unique-existing-facility-link",
    });
  if (!Number.isSafeInteger(c.basePrice) || c.basePrice <= 0)
    issue("Courts", c.id, "real-hourly-price-required");
  if (!["active", "maintenance", "archived"].includes(c.status))
    issue("Courts", c.id, "operational-status-needs-owner-review");
}
for (const b of rows("Bookings")) {
  if (b.schemaVersion !== 2)
    issue("Bookings", b.id, "legacy-payment-and-schedule-review-required");
  if (!b.ownerId) issue("Bookings", b.id, "verified-owner-required");
  if (
    !Number.isFinite(b.startAt) ||
    !Number.isFinite(b.endAt) ||
    b.endAt <= b.startAt
  )
    issue("Bookings", b.id, "validated-time-range-required");
  if ((b.depositPaid || 0) > 0 && !b.paymentReference)
    issue("Bookings", b.id, "amount-is-not-proof-of-received-payment");
}
for (const m of rows("Matches")) {
  if (!m.hostId) issue("Matches", m.id, "host-uid-required");
  if (!Number.isFinite(m.startAt) || !Number.isFinite(m.endAt))
    issue("Matches", m.id, "validated-match-datetime-required");
  if (m.costPerPerson == null && Number.isSafeInteger(m.cost) && m.cost >= 0)
    proposals.push({
      collection: "Matches",
      id: m.id,
      patch: { costPerPerson: m.cost },
      reason: "numeric-cost-rename",
    });
  else if (!Number.isSafeInteger(m.costPerPerson) || m.costPerPerson < 0)
    issue("Matches", m.id, "numeric-cost-per-person-required");
  const members = [...new Set(m.joinedUsers || [])];
  if (members.length > m.playersMax)
    issue("Matches", m.id, "membership-exceeds-capacity");
  else if (
    members.length !== (m.joinedUsers || []).length ||
    m.playersJoined !== members.length
  )
    proposals.push({
      collection: "Matches",
      id: m.id,
      patch: { joinedUsers: members, playersJoined: members.length },
      reason: "deduplicate-existing-members",
    });
}
const report = {
  mode: "dry-run",
  createdAt: new Date().toISOString(),
  counts: Object.fromEntries(collections.map((c) => [c, input[c].length])),
  issues,
  proposals,
  notice:
    "No database writes. Review owners, dates and actual bank transactions; never auto-confirm legacy payments.",
};
const output = resolve(
    args.includes("--output") ? value("--output") : "data_export/audit.json",
  ),
  rel = relative(process.cwd(), output);
if (rel.startsWith("..") || isAbsolute(rel))
  throw new Error("Output must stay within the workspace.");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2), "utf8");
console.log(
  `Dry-run: ${issues.length} findings, ${proposals.length} proposals; report ${rel}. No data changed.`,
);
