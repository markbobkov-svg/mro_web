"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AuthError, signUp } from "@/lib/authApi";
import { getAirline } from "@/lib/airlines";
import { emailDomain, exactDomainMatchesWebsite } from "@/lib/domains";
import { ForbiddenError, requireUser } from "@/lib/guards";
import { ensureAppUser } from "@/lib/session";
import { siteUrl } from "@/lib/siteUrl";
import { getAdminSupabase } from "@/lib/supabase";

export interface AirlineFormState {
  error?: string;
  notice?: string;
}

function str(data: FormData, key: string): string {
  const v = data.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function nullable(data: FormData, key: string): string | null {
  const v = str(data, key);
  return v === "" ? null : v;
}

function toMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Something went wrong. Try again.";
}

/**
 * Register an airline account.
 *
 * The whole flow lives here — there is no separate claim step. The person gives
 * a work e-mail and picks their airline (or names it, if it is not in the DB
 * yet). The decision that matters is made up front, from the selected airline:
 * when the e-mail domain is *exactly* that airline's website domain, the
 * registration is approved automatically; anything else waits for an admin.
 *
 * A confirmation mail goes out regardless (the project keeps
 * `mailer_autoconfirm` off), and the account cannot sign in until the link is
 * clicked. That confirmation is what makes the domain match mean anything — it
 * proves the address is really theirs. Membership is therefore only granted once
 * the account is confirmed (see activateAirlineMemberships, called on the
 * dashboard), never here at sign-up time.
 */
export async function registerAirlineAction(
  _prev: AirlineFormState,
  data: FormData,
): Promise<AirlineFormState> {
  const email = str(data, "email").toLowerCase();
  const password = str(data, "password");
  const fullName = str(data, "fullName");
  const jobTitle = str(data, "jobTitle");
  const airlineId = str(data, "airlineId");
  const proposedName = str(data, "proposedName");
  const note = nullable(data, "note");

  if (!email || !password) {
    return { error: "Enter your work e-mail and a password." };
  }
  if (password.length < 10) {
    return { error: "Use at least 10 characters for the password." };
  }
  if (!airlineId && !proposedName) {
    return { error: "Pick your airline, or add its name if it isn't listed." };
  }

  // Work out auto-verification against the *selected* airline's website before
  // touching the account, so an exact domain match approves and anything else
  // (a different domain, a free mailbox, an airline with no website on file, or a
  // not-yet-listed airline) falls to the manual queue.
  const host = emailDomain(email);
  let matched = false;
  let matchedDomain: string | null = null;

  if (airlineId) {
    const airline = await getAirline(airlineId);
    if (!airline) {
      return { error: "That airline is no longer in our records — search again." };
    }
    matched = exactDomainMatchesWebsite(host, airline.website);
    if (matched && host) matchedDomain = host.replace(/^www\./, "");
  }

  let userId = "";
  try {
    const { user } = await signUp(
      email,
      password,
      `${siteUrl()}/login?confirmed=1&next=/airline`,
    );
    userId = user.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "user_already_exists" || /already registered/i.test(err.message)) {
        return { error: "That e-mail already has an account — sign in instead." };
      }
      return { error: err.message };
    }
    throw err;
  }

  if (userId) {
    await ensureAppUser(userId, email, {
      fullName: fullName || null,
      jobTitle: jobTitle || null,
    });

    const supabase = getAdminSupabase();
    const { error } = await supabase.from("airline_registrations").insert({
      user_id: userId,
      airline_id: airlineId || null,
      proposed_name: airlineId ? null : proposedName,
      proposed_website: airlineId ? null : nullable(data, "proposedWebsite"),
      proposed_country_code: airlineId
        ? null
        : (nullable(data, "proposedCountry") ?? "").toUpperCase() || null,
      contact_note: note,
      status: matched ? "approved" : "pending",
      auto_verified: matched,
      matched_domain: matchedDomain,
      ...(matched ? { reviewed_at: new Date().toISOString() } : {}),
    });
    if (error) return { error: toMessage(error) };
  }

  redirect(
    `/airline/check-inbox?email=${encodeURIComponent(email)}${matched ? "&verified=1" : ""}`,
  );
}

/**
 * Account settings on the airline dashboard.
 *
 * Only ever writes the caller's own `app_users` row (keyed by their id), so this
 * is safe for any signed-in user and needs no per-airline check.
 */
export async function saveAirlineAccountAction(
  _prev: AirlineFormState,
  data: FormData,
): Promise<AirlineFormState> {
  const user = await requireUser("/airline");
  try {
    await ensureAppUser(user.id, user.email, {
      fullName: nullable(data, "fullName"),
      jobTitle: nullable(data, "jobTitle"),
      phone: nullable(data, "phone"),
    });
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath("/airline");
  return { notice: "Saved." };
}
