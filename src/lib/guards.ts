import "server-only";

import { redirect } from "next/navigation";

import { getAdminSupabase } from "./supabase";
import { getCurrentUser, type CurrentUser } from "./session";

/**
 * Authorisation boundary for the dashboard.
 *
 * The Supabase key this app holds is a service_role key, so the database will
 * happily return any row it is asked for — RLS does not stop us. That makes
 * these functions, not the policies, the thing that keeps one organisation out
 * of another's data. Rule: any code path that reads or writes rows for an
 * organisation id that came from the request must call `requireMember` (or
 * `requireAdmin`) first and use the id it returns.
 */

export class ForbiddenError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface Membership {
  organisationId: string;
  organisationName: string;
  role: string;
}

/** Signed-in user, or a redirect to the login page. */
export async function requireUser(returnTo = "/dashboard"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (!user.isAdmin) throw new ForbiddenError("Administrator access required");
  return user;
}

/** Every organisation this user may edit. */
export async function getMemberships(userId: string): Promise<Membership[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("organisation_members")
    .select("organisation_id, role, organisations(name)")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const org = row.organisations as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(org) ? org[0]?.name : org?.name;
    return {
      organisationId: String(row.organisation_id),
      organisationName: name ?? "Unnamed organisation",
      role: String(row.role ?? "owner"),
    };
  });
}

/**
 * Assert that `user` may act for `organisationId`.
 *
 * Throws rather than redirecting so a forged id in a form post fails loudly
 * instead of silently editing someone else's organisation. Admins pass for any
 * organisation.
 */
export async function requireMember(
  user: CurrentUser,
  organisationId: string,
): Promise<string> {
  if (!organisationId) throw new ForbiddenError("No organisation given");
  if (user.isAdmin) return organisationId;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", user.id)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ForbiddenError("You do not manage this organisation");
  return organisationId;
}

// ------------------------------------------------------------ airlines ------
// The airline side is the same authorisation model as organisations, one table
// over: membership in `airline_members`, not a listing to be claimed.

export interface AirlineMembership {
  airlineId: string;
  airlineName: string;
  role: string;
}

/** Every airline this user may manage. */
export async function getAirlineMemberships(
  userId: string,
): Promise<AirlineMembership[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("airline_members")
    .select("airline_id, role, airlines(name)")
    .eq("user_id", userId);

  // Soft-fail like the dashboard reads in data.ts: this runs during login
  // routing, so a not-yet-applied 0003 migration must not break sign-in. A
  // missing membership under-grants (they see "connect your airline"), never
  // over-grants — the write guard below still fails closed.
  if (error) return [];

  return (data ?? []).map((row) => {
    const air = row.airlines as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(air) ? air[0]?.name : air?.name;
    return {
      airlineId: String(row.airline_id),
      airlineName: name ?? "Unnamed airline",
      role: String(row.role ?? "owner"),
    };
  });
}

/** Assert that `user` may act for `airlineId`. Admins pass for any airline. */
export async function requireAirlineMember(
  user: CurrentUser,
  airlineId: string,
): Promise<string> {
  if (!airlineId) throw new ForbiddenError("No airline given");
  if (user.isAdmin) return airlineId;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("airline_members")
    .select("airline_id")
    .eq("user_id", user.id)
    .eq("airline_id", airlineId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ForbiddenError("You do not manage this airline");
  return airlineId;
}

/**
 * Where to send a user after they sign in, when no explicit `next` was given.
 *
 * Organisations and admins land on the MRO dashboard; a user known only through
 * the airline flow (a membership, or a registration still in the queue) lands on
 * the airline dashboard. Everyone else defaults to the organisation dashboard,
 * which is where a brand-new sign-up starts.
 */
export async function resolveHomePath(
  userId: string,
): Promise<"/dashboard" | "/airline"> {
  const [orgs, airlines] = await Promise.all([
    getMemberships(userId),
    getAirlineMemberships(userId),
  ]);
  if (orgs.length > 0) return "/dashboard";
  if (airlines.length > 0) return "/airline";

  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("airline_registrations")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  return data && data.length > 0 ? "/airline" : "/dashboard";
}
