import "server-only";

import { getAdminSupabase } from "./supabase";
import { websiteDomain } from "./domains";

/**
 * Reads for the airline dashboard and the airline slice of the admin queue.
 *
 * Nothing here checks permissions — callers must have gone through
 * `requireAirlineMember` / `requireAdmin` in guards.ts first, exactly as the
 * organisation reads in dashboard.ts do.
 */

export interface AirlineSummary {
  id: string;
  name: string;
  countryCode: string | null;
  website: string | null;
  /** Registrable domain of the website, or null — the auto-verify target. */
  domain: string | null;
}

export interface Airline {
  id: string;
  name: string;
  countryCode: string | null;
  website: string | null;
  source: string | null;
  sourceUrl: string | null;
}

export interface AirlineRegistrationRow {
  id: string;
  userId: string;
  userEmail: string | null;
  airlineId: string | null;
  airlineName: string | null;
  proposedName: string | null;
  proposedWebsite: string | null;
  proposedCountryCode: string | null;
  contactNote: string | null;
  status: "pending" | "approved" | "rejected";
  autoVerified: boolean;
  matchedDomain: string | null;
  reviewNote: string | null;
  createdAt: string;
}

/** Type-ahead over airline names for the registration form. */
export async function searchAirlines(
  query: string,
  limit = 12,
): Promise<AirlineSummary[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = getAdminSupabase();
  const escaped = q.replace(/[%_,()]/g, " ").trim();
  if (!escaped) return [];

  const { data, error } = await supabase
    .from("airlines")
    .select("id, name, country_code, website")
    .ilike("name", `%${escaped}%`)
    .order("name")
    .limit(limit);
  if (error) throw new Error(`searchAirlines: ${error.message}`);

  return ((data as Record<string, unknown>[]) ?? []).map(readAirlineSummary);
}

function readAirlineSummary(r: Record<string, unknown>): AirlineSummary {
  const website = (r.website as string | null) ?? null;
  return {
    id: String(r.id),
    name: String(r.name ?? "Unnamed airline"),
    countryCode: (r.country_code as string | null) ?? null,
    website,
    domain: websiteDomain(website),
  };
}

/** One airline by id, for the dashboard header. */
export async function getAirline(airlineId: string): Promise<Airline | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("airlines")
    .select("id, name, country_code, website, source, source_url")
    .eq("id", airlineId)
    .maybeSingle();
  if (error) throw new Error(`getAirline: ${error.message}`);
  if (!data) return null;

  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name ?? "Unnamed airline"),
    countryCode: (r.country_code as string | null) ?? null,
    website: (r.website as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
  };
}

/** The exact-match domain this airline auto-verifies against, if any. */
export async function getAirlineDomain(airlineId: string): Promise<string | null> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("airlines")
    .select("website")
    .eq("id", airlineId)
    .maybeSingle();
  return websiteDomain((data as Record<string, unknown> | null)?.website as string | null);
}

/**
 * Turn a confirmed account's auto-verified registrations into memberships.
 *
 * Registration happens before the e-mail is confirmed, so an auto-approved
 * sign-up cannot be granted its membership on the spot — the confirmation is the
 * proof the address is theirs. This closes that gap: once the account is
 * confirmed (the dashboard calls this on load), every `approved` registration it
 * holds gets its `airline_members` row. Idempotent — it upserts, so repeated
 * dashboard loads are harmless, and it never grants anything for an unconfirmed
 * account.
 */
export async function activateAirlineMemberships(
  userId: string,
  emailConfirmed: boolean,
): Promise<void> {
  if (!emailConfirmed) return;

  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("airline_registrations")
    .select("airline_id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .not("airline_id", "is", null);

  const airlineIds = [
    ...new Set(
      ((data as Record<string, unknown>[]) ?? []).map((r) => String(r.airline_id)),
    ),
  ];
  if (airlineIds.length === 0) return;

  await supabase.from("airline_members").upsert(
    airlineIds.map((id) => ({ airline_id: id, user_id: userId, role: "owner" })),
    { onConflict: "airline_id,user_id" },
  );
}

/** Registrations filed by one user, newest first. */
export async function getUserAirlineRegistrations(
  userId: string,
): Promise<AirlineRegistrationRow[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("airline_registrations")
    .select("*, airlines(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  // Soft-fail if 0003 has not been applied yet — the dashboard must still load.
  if (error) return [];
  return ((data as Record<string, unknown>[]) ?? []).map((r) => readRegistration(r, null));
}

/** The admin queue: airline registrations still awaiting a decision. */
export async function getPendingAirlineRegistrations(): Promise<AirlineRegistrationRow[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("airline_registrations")
    .select("*, airlines(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  // Soft-fail if 0003 has not been applied yet, so /admin keeps working for the
  // organisation queues that predate it.
  if (error) return [];

  const rows = (data as Record<string, unknown>[]) ?? [];
  const emails = await emailsByUserId(rows.map((r) => String(r.user_id)));
  return rows.map((r) => readRegistration(r, emails.get(String(r.user_id)) ?? null));
}

/**
 * Look up the e-mail for a set of accounts. Registrations key on `auth.users`
 * and `app_users` keys on the same ids without a foreign key between the two, so
 * PostgREST cannot embed one in the other — this second query is how the
 * reviewer sees who asked. Same shape as dashboard.ts's helper of the same name.
 */
async function emailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const supabase = getAdminSupabase();
  const { data } = await supabase.from("app_users").select("id, email").in("id", ids);
  return new Map(
    ((data as Record<string, unknown>[]) ?? []).map((u) => [
      String(u.id),
      String(u.email ?? ""),
    ]),
  );
}

function embedded(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  return value as Record<string, unknown>;
}

function readRegistration(
  r: Record<string, unknown>,
  email: string | null,
): AirlineRegistrationRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    userEmail: email,
    airlineId: (r.airline_id as string | null) ?? null,
    airlineName: (embedded(r.airlines)?.name as string | null) ?? null,
    proposedName: (r.proposed_name as string | null) ?? null,
    proposedWebsite: (r.proposed_website as string | null) ?? null,
    proposedCountryCode: (r.proposed_country_code as string | null) ?? null,
    contactNote: (r.contact_note as string | null) ?? null,
    status: (r.status as AirlineRegistrationRow["status"]) ?? "pending",
    autoVerified: Boolean(r.auto_verified),
    matchedDomain: (r.matched_domain as string | null) ?? null,
    reviewNote: (r.review_note as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}
