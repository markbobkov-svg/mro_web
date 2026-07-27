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
