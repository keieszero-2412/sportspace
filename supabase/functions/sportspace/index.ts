import { saveProfile } from "./profile.js";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import { HOLD_MS, interval, overlaps, lockIds, quote } from "./domain.ts";

const hash = async (value: string): Promise<string> => {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const text = (v: any, max = 500) =>
  String(v || "")
    .trim()
    .slice(0, max);
const id = (v: any) => {
  const s = text(v, 150);
  if (!s || s.includes("/")) throw new Error("invalid-id");
  return s;
};
const matchDateTime = (date: any, time: any) =>
  Date.parse(`${text(date, 10)}T${text(time, 5)}:00+07:00`);
const matchMoney = (value: any) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000)
    throw new Error("invalid-money");
  return Math.round(amount);
};

// Database connection URL
const DATABASE_URL =
  Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("MY_SUPABASE_DB_URL") || "";

// Edge workers are short-lived and should not create a multi-connection pool.
// Keep the client absent when the secret is missing so non-booking actions can
// still return a useful error instead of crashing the whole worker at import.
let sql: any = null;
async function getSql() {
  if (!DATABASE_URL) return null;
  if (!sql) {
    const { default: postgres } =
      await import("https://deno.land/x/postgresjs@v3.4.4/mod.js");
    sql = postgres(DATABASE_URL, {
      max: 1,
      idle_timeout: 5,
      connect_timeout: 5,
      max_lifetime: 60,
      prepare: false,
    });
  }
  return sql;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const token =
      req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser(token);

    if (authError) throw authError;
    if (!user) throw new Error("unauthenticated");
    const uid = user.id;

    const body = await req.json();
    const action = body.action;
    const data = body.data || body;
    const now = Date.now();

    if (action === "holdBooking") {
      const bookingSql = await getSql();
      if (!bookingSql) throw new Error("database-not-configured");
      const facilityId = id(data.facilityId);
      const courtId = id(data.courtId);
      const key = id(data.key);
      const bookingId = await hash(`${uid}:${key}`);
      const fingerprint = await hash(
        JSON.stringify([
          facilityId,
          courtId,
          data.date,
          data.times,
          data.duration,
        ]),
      );

      const result = await bookingSql.begin(async (tx: any) => {
        // Check if booking already exists
        const [old] =
          await tx`SELECT * FROM "Bookings" WHERE id = ${bookingId}`;
        if (old) {
          if (old.fingerprint !== fingerprint)
            throw new Error("idempotency-key-reused");
          if (old.holdExpiresAt <= now) throw new Error("hold-expired");
          return old;
        }

        const [fs] =
          await tx`SELECT * FROM "Facilities" WHERE id = ${facilityId}`;
        const [cs] = await tx`SELECT * FROM "Courts" WHERE id = ${courtId}`;
        const [ps] =
          await tx`SELECT * FROM "PaymentConfig" WHERE id = ${facilityId}`;

        if (
          !fs?.ownerId ||
          fs.status === "archived" ||
          !cs ||
          cs.status !== "active"
        ) {
          throw new Error("court-not-bookable");
        }
        if (!ps?.verifiedAt) throw new Error("payment-not-configured");

        if (
          !Array.isArray(data.times) ||
          !data.times.length ||
          data.times.length > 16
        ) {
          throw new Error("select-time");
        }

        const ranges = [...new Set(data.times)]
          .map((t: string) =>
            interval(data.date, t, data.duration, fs.operating_hours),
          )
          .sort((a, b) => a.startAt - b.startAt);

        if (
          ranges.some((r) => r.startAt <= now) ||
          ranges.some((r, i) => i > 0 && overlaps(r, ranges[i - 1]))
        ) {
          throw new Error("invalid-interval");
        }

        const keys = lockIds(courtId, ranges);

        // Check existing locks
        if (keys.length > 0) {
          const locks =
            await tx`SELECT * FROM "SlotLocks" WHERE id IN ${tx(keys)}`;
          if (locks.some((s) => s.expiresAt > now)) {
            throw new Error("slot-taken");
          }
        }

        const totalAmount = quote(cs, fs, ranges);
        const expires = Math.min(now + HOLD_MS, ranges[0].startAt);

        const b = {
          id: bookingId,
          schemaVersion: 2,
          userId: uid,
          ownerId: fs.ownerId,
          venueId: facilityId,
          facilityId,
          courtId,
          courtName: cs.name,
          venueName: fs.name,
          date: data.date,
          time: data.times.join(", "),
          duration: data.duration,
          ranges: JSON.stringify(ranges),
          startAt: ranges[0].startAt,
          endAt: ranges[ranges.length - 1].endAt,
          totalAmount,
          depositPaid: 0,
          paymentStatus: "unpaid",
          refundStatus: "none",
          status: "held",
          holdExpiresAt: expires,
          lockIds: JSON.stringify(keys),
          key,
          fingerprint,
          ticketId: `SS-${bookingId.slice(0, 12).toUpperCase()}`,
          customerName: text(data.customerName, 100),
          phone: text(data.phone, 30),
          note: text(data.note),
          paymentMethod: "bank_transfer",
          paymentGateway: "Bank transfer",
          createdAt: new Date(now).toISOString(),
          pricingSnapshot: JSON.stringify({
            basePrice: cs.basePrice,
            pricing: fs.pricing || {},
            version: fs.pricingVersion || cs.updatedAt || null,
          }),
        };

        if (!b.customerName || !/^[+\d\s-]{8,20}$/.test(b.phone)) {
          throw new Error("customer-details-required");
        }

        // Insert locks and availability
        for (const k of keys) {
          const startAt = Number(k.slice(k.lastIndexOf("_") + 1));
          await tx`
            INSERT INTO "SlotLocks" (id, "bookingId", "courtId", "expiresAt")
            VALUES (${k}, ${bookingId}, ${courtId}, ${expires})
            ON CONFLICT (id) DO UPDATE SET "bookingId" = EXCLUDED."bookingId", "courtId" = EXCLUDED."courtId", "expiresAt" = EXCLUDED."expiresAt"
          `;
          await tx`
            INSERT INTO "Availability" (id, "facilityId", "courtId", "facility_id", "court_id", "bookingId", date, "startAt", "endAt", "expiresAt", status)
            VALUES (${k}, ${facilityId}, ${courtId}, ${facilityId}, ${courtId}, ${bookingId}, ${data.date}, ${startAt}, ${startAt + 1800000}, ${expires}, 'held')
            ON CONFLICT (id) DO UPDATE SET
              "facilityId" = EXCLUDED."facilityId",
              "courtId" = EXCLUDED."courtId",
              "facility_id" = EXCLUDED."facility_id",
              "court_id" = EXCLUDED."court_id",
              "bookingId" = EXCLUDED."bookingId",
              date = EXCLUDED.date,
              "startAt" = EXCLUDED."startAt",
              "endAt" = EXCLUDED."endAt",
              "expiresAt" = EXCLUDED."expiresAt",
              status = EXCLUDED.status
          `;
        }

        await tx`INSERT INTO "Bookings" ${tx(b)}`;
        return b;
      });

      return new Response(JSON.stringify({ data: result }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (action === "saveProfile") {
      // Auth/profile creation uses the project's HTTP API, not the separate
      // Postgres pooler URL required by booking transactions.
      const profileClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const result = await saveProfile(profileClient, user, data, now);
      return new Response(JSON.stringify({ data: result }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: profile, error: profileError } = await serviceClient
      .from("Users")
      .select("name, role, credibilityScore, raw_data")
      .eq("id", uid)
      .maybeSingle();
    if (profileError) throw profileError;
    const role = profile?.role || profile?.raw_data?.role;

    if (action === "createMatch") {
      const rawCredibility = Number(profile?.credibilityScore ?? profile?.raw_data?.credibilityScore ?? 0);
      const credibility = rawCredibility > 100 ? rawCredibility / 100 : rawCredibility;
      if (!Number.isFinite(credibility) || credibility <= 80) throw new Error("credibility-too-low");
      const startAt = matchDateTime(data.date, data.startTime);
      const endAt = matchDateTime(data.date, data.endTime);
      const playersMax = Number(data.playersMax);
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= now || endAt <= startAt || !text(data.title) || !text(data.venueName))
        throw new Error("invalid-match");
      if (!Number.isInteger(playersMax) || playersMax < 2 || playersMax > 22) throw new Error("invalid-capacity");
      if (profile?.raw_data?.deletionRequested) throw new Error("account-deleting");
      const matchId = await hash(`${uid}:${id(data.key)}`);
      const hostName = profile?.name || profile?.raw_data?.name || user.email || "Player";
      const match = {
        id: matchId, title: text(data.title, 150), sport: text(data.sport, 50), province: text(data.province, 100),
        venueId: data.venueId ? id(data.venueId) : null, venueName: text(data.venueName, 150),
        courtId: data.courtId ? id(data.courtId) : null, courtName: text(data.courtName, 150) || null,
        date: text(data.date, 10), time: `${text(data.startTime, 5)} - ${text(data.endTime, 5)}`,
        startAt, endAt, levelRequired: text(data.levelRequired, 100), costPerPerson: matchMoney(data.costPerPerson),
        playersMax, playersJoined: 1, joinedUsers: [uid], memberNames: { [uid]: hostName }, hostId: uid, hostName,
        hostCredibility: Math.min(100, Math.round(credibility)), status: "open",
        lat: Number.isFinite(Number(data.lat)) ? Number(data.lat) : null, lng: Number.isFinite(Number(data.lng)) ? Number(data.lng) : null,
        createdAt: now,
      };
      const { data: saved, error } = await serviceClient.from("Matches")
        .upsert({ ...match, raw_data: match }, { onConflict: "id", ignoreDuplicates: true }).select("*").single();
      if (error) throw error;
      return new Response(JSON.stringify({ data: saved }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    if (action === "matchTransition") {
      if (profile?.raw_data?.deletionRequested) throw new Error("account-deleting");
      const actorName = profile?.name || profile?.raw_data?.name || user.email || "Player";
      const { data: patch, error } = await serviceClient.rpc("match_transition", {
        p_match_id: id(data.matchId), p_actor_id: uid, p_actor_name: actorName,
        p_operation: text(data.operation, 20), p_now: now,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ data: patch }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    if (action === "editMatch") {
      const matchId = id(data.matchId);
      const { data: current, error: readError } = await serviceClient.from("Matches").select("*").eq("id", matchId).maybeSingle();
      if (readError) throw readError;
      if (!current || current.hostId !== uid) throw new Error("not-match-host");
      if (current.status !== "open" || current.startAt <= now) throw new Error("match-closed");
      const startAt = matchDateTime(data.date, data.startTime);
      const endAt = matchDateTime(data.date, data.endTime);
      const playersMax = Number(data.playersMax);
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= now || endAt <= startAt ||
          !Number.isInteger(playersMax) || playersMax < Math.max(2, current.joinedUsers?.length || 0) ||
          playersMax > 22 || !text(data.title) || !text(data.venueName)) throw new Error("invalid-match");
      const patch = {
        title: text(data.title, 150), sport: text(data.sport, 50), province: text(data.province, 100),
        venueName: text(data.venueName, 150), date: text(data.date, 10),
        time: `${text(data.startTime, 5)} - ${text(data.endTime, 5)}`, startAt, endAt, playersMax,
        costPerPerson: matchMoney(data.costPerPerson), levelRequired: text(data.levelRequired, 100), updatedAt: now,
      };
      const { error } = await serviceClient.from("Matches")
        .update({ ...patch, raw_data: { ...(current.raw_data || {}), ...patch } }).eq("id", matchId);
      if (error) throw error;
      return new Response(JSON.stringify({ data: patch }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    if (action === "applyMerchant") {
      if (!text(data.venueName) || !text(data.venueAddress))
        throw new Error("venue-details-required");
      const documentPaths = Array.isArray(data.documentPaths)
        ? data.documentPaths.slice(0, 5).map((value: any) => text(value, 300))
        : [];
      const { error } = await serviceClient
        .from("MerchantApplications")
        .upsert({
          id: uid,
          userId: uid,
          venueName: text(data.venueName),
          venueAddress: text(data.venueAddress),
          venueSport: text(data.venueSport),
          venueScale: Number(data.venueScale || 1),
          bankName: text(data.bankName),
          bankAccount: text(data.bankAccount),
          bankOwner: text(data.bankOwner),
          documentPaths,
          status: "pending",
          submittedAt: new Date(now).toISOString(),
        });
      if (error) throw error;
      return new Response(JSON.stringify({ data: { status: "pending" } }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (action === "approveMerchant" || action === "verifyBank") {
      if (role !== "admin") throw new Error("admin-required");
      const facilityId = id(data.facilityId);
      const { data: facility, error: facilityError } = await serviceClient
        .from("Facilities")
        .select("id, ownerId")
        .eq("id", facilityId)
        .maybeSingle();
      if (facilityError) throw facilityError;
      if (!facility) throw new Error("facility-not-found");

      if (action === "verifyBank") {
        const bank = {
          id: facilityId,
          bin: text(data.bin, 6),
          account: text(data.account, 30),
          name: text(data.name, 100),
          verifiedBy: uid,
          verifiedAt: now,
        };
        if (
          !/^\d{6}$/.test(bank.bin) ||
          !/^\d{5,30}$/.test(bank.account) ||
          !bank.name
        )
          throw new Error("invalid-bank");
        const { error } = await serviceClient
          .from("PaymentConfig")
          .upsert(bank);
        if (error) throw error;
        return new Response(JSON.stringify({ data: { verified: true } }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const targetUserId = id(data.userId);
      const [
        { data: application, error: applicationError },
        { data: targetProfile, error: targetError },
      ] = await Promise.all([
        serviceClient
          .from("MerchantApplications")
          .select("*")
          .eq("id", targetUserId)
          .maybeSingle(),
        serviceClient
          .from("Users")
          .select("*")
          .eq("id", targetUserId)
          .maybeSingle(),
      ]);
      if (applicationError) throw applicationError;
      if (targetError) throw targetError;
      if (
        !application ||
        !targetProfile ||
        (facility.ownerId && facility.ownerId !== targetUserId)
      )
        throw new Error("invalid-application");

      const rawData = { ...(targetProfile.raw_data || {}), role: "merchant" };
      const { error: userError } = await serviceClient
        .from("Users")
        .update({ role: "merchant", raw_data: rawData })
        .eq("id", targetUserId);
      if (userError) throw userError;
      const { error: facilityUpdateError } = await serviceClient
        .from("Facilities")
        .update({ ownerId: targetUserId })
        .eq("id", facilityId);
      if (facilityUpdateError) throw facilityUpdateError;
      const { error: applicationUpdateError } = await serviceClient
        .from("MerchantApplications")
        .update({
          status: "approved",
          approvedBy: uid,
          approvedAt: new Date(now).toISOString(),
          facilityId,
        })
        .eq("id", targetUserId);
      if (applicationUpdateError) throw applicationUpdateError;
      return new Response(JSON.stringify({ data: { approved: true } }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (action === "savedVenues") {
      const profileClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: profile, error: profileError } = await profileClient
        .from("Users")
        .select("raw_data")
        .eq("id", uid)
        .maybeSingle();
      if (profileError) throw profileError;

      const savedVenueIds = Array.isArray(profile?.raw_data?.savedVenueIds)
        ? profile.raw_data.savedVenueIds.slice(0, 200)
        : [];
      if (!savedVenueIds.length) {
        return new Response(JSON.stringify({ data: [] }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      const { data: venues, error: venuesError } = await profileClient
        .from("Facilities")
        .select("*")
        .in("id", savedVenueIds);
      if (venuesError) throw venuesError;

      const order = new Map(
        savedVenueIds.map((venueId: string, index: number) => [venueId, index]),
      );
      const result = (venues || []).sort(
        (a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
      return new Response(JSON.stringify({ data: result }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    throw new Error("Action not supported yet");
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        code: err?.code,
        detail: err?.detail,
        hint: err?.hint,
        name: err?.name,
      }),
      {
        status: 200, // Return 200 to prevent Supabase JS from hiding the error body!
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});
