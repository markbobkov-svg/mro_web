"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOrganisationDomains, getOrganisationHold } from "@/lib/dashboard";
import { domainsMatch, emailDomain, isFreeMailDomain } from "@/lib/domains";
import { ForbiddenError, requireMember, requireUser } from "@/lib/guards";
import { getAdminSupabase } from "@/lib/supabase";

export interface ActionState {
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

/** Turn a thrown guard/database error into a message the form can show. */
function toMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Something went wrong. Try again.";
}

// ---------------------------------------------------------------- claims ---

/**
 * Claim an organisation that is already in the database.
 *
 * The account's e-mail must be confirmed first — otherwise "my address is on
 * their domain" proves nothing, since anyone can type any address at sign-up.
 * A confirmed address on the organisation's own domain is approved on the spot;
 * anything else waits for a human.
 */
export async function claimExistingOrgAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser("/dashboard/claim");
  const organisationId = str(data, "organisationId");
  const note = nullable(data, "note");

  if (!organisationId) return { error: "Pick an organisation first." };

  if (!user.emailConfirmed) {
    return {
      error:
        "Confirm your e-mail address before claiming — the confirmation is what proves the address is yours.",
    };
  }

  const supabase = getAdminSupabase();

  // One account, one organisation. A member is sent to the listing it already
  // holds; an account with a claim still pending or approved cannot open another.
  const hold = await getOrganisationHold(user.id);
  if (hold.membershipOrgId) redirect(`/dashboard/${hold.membershipOrgId}`);
  if (hold.hasActiveClaim) {
    return {
      error:
        "Your account already has a claim in progress — each account can claim one organisation.",
    };
  }

  const host = emailDomain(user.email);
  const orgDomains = await getOrganisationDomains(organisationId);
  const matched =
    host && !isFreeMailDomain(host)
      ? orgDomains.find((d) => domainsMatch(host, d)) ?? null
      : null;

  try {
    const { data: claim, error } = await supabase
      .from("organisation_claims")
      .insert({
        user_id: user.id,
        kind: "existing",
        organisation_id: organisationId,
        contact_note: note,
        status: matched ? "approved" : "pending",
        auto_verified: Boolean(matched),
        matched_domain: matched,
        ...(matched ? { reviewed_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();
    if (error) throw error;

    if (matched) {
      const { error: memberError } = await supabase
        .from("organisation_members")
        .upsert(
          { organisation_id: organisationId, user_id: user.id, role: "owner" },
          { onConflict: "organisation_id,user_id" },
        );
      if (memberError) {
        // Leave the claim for a human rather than reporting success we didn't get.
        await supabase
          .from("organisation_claims")
          .update({ status: "pending", auto_verified: false })
          .eq("id", claim.id);
        throw memberError;
      }
    }
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath("/dashboard");
  if (matched) redirect(`/dashboard/${organisationId}?claimed=1`);
  redirect("/dashboard?submitted=1");
}

/**
 * Ask for an organisation that is not in the database yet. Always reviewed by
 * hand — there is no existing record to check the e-mail domain against.
 */
export async function requestNewOrgAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser("/dashboard/claim");

  const name = str(data, "name");
  if (!name) return { error: "Enter the organisation's name." };

  if (!user.emailConfirmed) {
    return { error: "Confirm your e-mail address first." };
  }

  // One account, one organisation — see claimExistingOrgAction.
  const hold = await getOrganisationHold(user.id);
  if (hold.membershipOrgId) redirect(`/dashboard/${hold.membershipOrgId}`);
  if (hold.hasActiveClaim) {
    return {
      error:
        "Your account already has a claim in progress — each account can claim one organisation.",
    };
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("organisation_claims").insert({
    user_id: user.id,
    kind: "new",
    organisation_id: null,
    proposed_name: name,
    proposed_legal_name: nullable(data, "legalName"),
    proposed_country_code: (nullable(data, "countryCode") ?? "").toUpperCase() || null,
    proposed_website: nullable(data, "website"),
    proposed_address: nullable(data, "address"),
    proposed_approval_ref: nullable(data, "approvalRef"),
    contact_note: nullable(data, "note"),
    status: "pending",
  });
  if (error) return { error: toMessage(error) };

  revalidatePath("/dashboard");
  redirect("/dashboard?submitted=1");
}

// --------------------------------------------------------------- profile ---

/** Instant-publish fields. Every value is an override of the scraped record. */
export async function saveProfileAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");

  try {
    await requireMember(user, organisationId);

    const supabase = getAdminSupabase();
    const { error } = await supabase.from("organisation_profiles").upsert(
      {
        organisation_id: organisationId,
        tagline: nullable(data, "tagline"),
        description: nullable(data, "description"),
        logo_url: nullable(data, "logoUrl"),
        website: nullable(data, "website"),
        email: nullable(data, "email"),
        phone: nullable(data, "phone"),
        address: nullable(data, "address"),
        aog_phone: nullable(data, "aogPhone"),
        aog_email: nullable(data, "aogEmail"),
        updated_by: user.id,
      },
      { onConflict: "organisation_id" },
    );
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: "Saved — it is live on the map now." };
}

// -------------------------------------------------------------- contacts ---

/**
 * Contacts, scope and stations — all instant, all straight to the real tables.
 *
 * A claimed organisation owns its rows (migration 0005): there is no override
 * layer any more, so these write `organisation_contacts`,
 * `organisation_scope`, `organisation_station_scope` and
 * `organisation_stations` directly. `requireMember` is the security boundary —
 * the service_role key means the database will hand over any row it is asked
 * for, so every action below must check membership before touching anything.
 */

/** A checkbox is absent from the form data entirely when unticked. */
function bool(data: FormData, key: string): boolean {
  const v = data.get(key);
  return v === "on" || v === "true" || v === "1";
}

function locationScope(data: FormData, key: string): string | null {
  const v = str(data, key).toLowerCase();
  return v === "line" || v === "base" || v === "both" ? v : null;
}

/** Look an airport up by IATA or ICAO code. */
async function airportIdByCode(
  supabase: ReturnType<typeof getAdminSupabase>,
  code: string,
): Promise<string | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  const { data } = await supabase
    .from("airports")
    .select("id")
    .or(`iata_code.eq.${c},icao_code.eq.${c}`)
    .limit(1)
    .maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

/** The station must belong to this organisation — never trust a posted id. */
async function assertOwnStation(
  supabase: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  stationId: string,
): Promise<void> {
  const { data } = await supabase
    .from("organisation_stations")
    .select("id")
    .eq("id", stationId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!data) throw new ForbiddenError("That station is not yours.");
}

/** A UNIQUE-constraint clash (Postgres 23505), not a genuine error. */
function isDuplicate(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return e.code === "23505" || /duplicate key value/i.test(e.message ?? "");
}

/**
 * PostgREST rejecting a write because a column is not in its schema cache —
 * which is what a not-yet-applied migration looks like from here.
 */
function isUnknownColumn(err: unknown, column: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === "PGRST204" &&
    new RegExp(`'${column}' column`, "i").test(e.message ?? "")
  );
}

function revalidateOrg(organisationId: string): void {
  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
}

// ------------------------------------------------------------- contacts ----

export async function saveContactAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const contactId = str(data, "contactId");
  // Empty = an organisation-wide desk, shown for stations that have none.
  const stationId = str(data, "stationId");

  const row = {
    organisation_id: organisationId,
    station_id: stationId || null,
    function_label: nullable(data, "functionLabel"),
    name: nullable(data, "name"),
    phone: nullable(data, "phone"),
    email: nullable(data, "email"),
    hours: nullable(data, "hours"),
    sort_order: Number(str(data, "sortOrder") || 0),
  };

  if (!row.function_label && !row.name && !row.phone && !row.email) {
    return { error: "Give the desk a name, a phone or an e-mail." };
  }

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    if (stationId) await assertOwnStation(supabase, organisationId, stationId);

    if (contactId) {
      const { error } = await supabase
        .from("organisation_contacts")
        .update(row)
        .eq("id", contactId)
        .eq("organisation_id", organisationId);
      if (error) throw error;
    } else {
      // `model` is NOT NULL — the scraper records what extracted a contact, so
      // mark ours as dashboard-entered.
      const { error } = await supabase
        .from("organisation_contacts")
        .insert({ ...row, model: "dashboard" });
      if (error) throw error;
    }
  } catch (err) {
    // contact_key is generated from the desk's own fields and is UNIQUE, so an
    // exact duplicate is a clash rather than a real failure — say so plainly.
    if (isDuplicate(err)) {
      return { error: "You already have a contact with exactly these details." };
    }
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: contactId ? "Contact saved." : "Contact added." };
}

export async function deleteContactAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const contactId = str(data, "contactId");
  if (!contactId) return { error: "Nothing to remove." };

  try {
    await requireMember(user, organisationId);
    const { error } = await getAdminSupabase()
      .from("organisation_contacts")
      .delete()
      .eq("id", contactId)
      .eq("organisation_id", organisationId);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: "Contact removed." };
}

// ---------------------------------------------------------------- scope ----

/** Shared column shape for both scope tables. */
function scopeRow(data: FormData, organisationId: string) {
  const approvalId = str(data, "approvalId");
  return {
    organisation_id: organisationId,
    organisation_approval_id: approvalId || null,
    rating_class_text: nullable(data, "ratingClass"),
    scope_text: nullable(data, "scopeText"),
    location_scope: locationScope(data, "locationScope"),
  };
}

/** Copy the approval's authority onto the line, so the card groups it right. */
async function authorityForApproval(
  supabase: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  approvalId: string | null,
): Promise<{ authority_id: string | null; authority_text: string | null }> {
  if (!approvalId) return { authority_id: null, authority_text: null };
  const { data } = await supabase
    .from("organisation_approvals")
    .select("authority_id, authorities(code)")
    .eq("id", approvalId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!data) throw new ForbiddenError("That approval is not yours.");
  const row = data as Record<string, unknown>;
  return {
    authority_id: (row.authority_id as string | null) ?? null,
    authority_text: embeddedCode(row.authorities),
  };
}

export async function saveOrgScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const scopeId = str(data, "scopeId");
  const row = scopeRow(data, organisationId);

  if (!row.scope_text) {
    return { error: "Enter the scope line — a class on its own has nothing to show." };
  }

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    const auth = await authorityForApproval(
      supabase,
      organisationId,
      row.organisation_approval_id,
    );
    const full = { ...row, ...auth };

    if (scopeId) {
      const { error } = await supabase
        .from("organisation_scope")
        .update(full)
        .eq("id", scopeId)
        .eq("organisation_id", organisationId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("organisation_scope").insert(full);
      if (error) throw error;
    }
  } catch (err) {
    if (isDuplicate(err)) {
      return { error: "That scope line is already on your list." };
    }
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: scopeId ? "Scope line saved." : "Scope line added." };
}

export async function deleteOrgScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const scopeId = str(data, "scopeId");
  if (!scopeId) return { error: "Nothing to remove." };

  try {
    await requireMember(user, organisationId);
    const { error } = await getAdminSupabase()
      .from("organisation_scope")
      .delete()
      .eq("id", scopeId)
      .eq("organisation_id", organisationId);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: "Scope line removed." };
}

// -------------------------------------------------------- station scope ----

export async function saveStationScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const stationId = str(data, "stationId");
  const scopeId = str(data, "scopeId");
  const row = scopeRow(data, organisationId);

  if (!stationId) return { error: "Pick a station first." };
  if (!row.scope_text) {
    return { error: "Enter the scope line — a class on its own has nothing to show." };
  }

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    await assertOwnStation(supabase, organisationId, stationId);
    const auth = await authorityForApproval(
      supabase,
      organisationId,
      row.organisation_approval_id,
    );
    const full = { ...row, ...auth, station_id: stationId };

    if (scopeId) {
      const { error } = await supabase
        .from("organisation_station_scope")
        .update(full)
        .eq("id", scopeId)
        .eq("organisation_id", organisationId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("organisation_station_scope").insert(full);
      if (error) throw error;
    }
  } catch (err) {
    if (isDuplicate(err)) {
      return { error: "That scope line is already on this station." };
    }
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: scopeId ? "Scope line saved." : "Scope line added." };
}

export async function deleteStationScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const scopeId = str(data, "scopeId");
  if (!scopeId) return { error: "Nothing to remove." };

  try {
    await requireMember(user, organisationId);
    const { error } = await getAdminSupabase()
      .from("organisation_station_scope")
      .delete()
      .eq("id", scopeId)
      .eq("organisation_id", organisationId);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: "Scope line removed." };
}

/**
 * Copy the organisation's own certified scope onto one station, so a station
 * that works everything the organisation is approved for can be filled in one
 * click and then trimmed line by line.
 */
export async function importOrgScopeToStationAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const stationId = str(data, "stationId");
  if (!stationId) return { error: "Pick a station first." };

  let copied = 0;
  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    await assertOwnStation(supabase, organisationId, stationId);

    const { data: orgScope, error: readErr } = await supabase
      .from("organisation_scope")
      .select(
        "organisation_approval_id, authority_id, authority_text, rating_class_text, scope_text, location_scope",
      )
      .eq("organisation_id", organisationId)
      .limit(3000);
    if (readErr) throw readErr;

    // Both scope tables carry a generated, UNIQUE scope_key, so two identical
    // lines in the organisation's own scope would sink the whole batch. Collapse
    // them first — the station only needs each distinct line once.
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const r of (orgScope as Record<string, unknown>[]) ?? []) {
      const key = [r.rating_class_text, r.scope_text, r.location_scope]
        .map((v) => String(v ?? ""))
        .join("|")
        .toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        organisation_id: organisationId,
        station_id: stationId,
        organisation_approval_id: r.organisation_approval_id ?? null,
        authority_id: r.authority_id ?? null,
        authority_text: r.authority_text ?? null,
        rating_class_text: r.rating_class_text ?? null,
        scope_text: r.scope_text ?? null,
        location_scope: r.location_scope ?? null,
      });
    }
    if (rows.length === 0) {
      return { error: "There is no organisation scope to import yet." };
    }

    // Replace what the station has, so importing twice doesn't double it up.
    const { error: delErr } = await supabase
      .from("organisation_station_scope")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("station_id", stationId);
    if (delErr) throw delErr;

    // ignoreDuplicates: anything that still clashes on scope_key is already
    // there, which is the outcome we wanted anyway.
    const { error } = await supabase
      .from("organisation_station_scope")
      .upsert(rows, { onConflict: "scope_key", ignoreDuplicates: true });
    if (error) throw error;
    copied = rows.length;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: `Imported ${copied} scope line${copied === 1 ? "" : "s"}.` };
}

// ------------------------------------------------------------- stations ----

export async function saveStationAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const stationId = str(data, "stationId");
  const airportCode = str(data, "airportCode");

  const details = {
    address: nullable(data, "address"),
    phone: nullable(data, "phone"),
    email: nullable(data, "email"),
    hours: nullable(data, "hours"),
    is_base: bool(data, "isBase"),
  };

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();

    // `hours` arrives with migration 0006. Until that is applied the column is
    // not there, so drop it and save the rest rather than failing the whole
    // edit — the field simply doesn't stick until the migration runs.
    const withoutHours = () => {
      const { hours: _hours, ...rest } = details;
      return rest;
    };

    if (stationId) {
      await assertOwnStation(supabase, organisationId, stationId);
      const update = (row: Record<string, unknown>) =>
        supabase
          .from("organisation_stations")
          .update(row)
          .eq("id", stationId)
          .eq("organisation_id", organisationId);
      let { error } = await update(details);
      if (isUnknownColumn(error, "hours")) ({ error } = await update(withoutHours()));
      if (error) throw error;
    } else {
      if (!airportCode) return { error: "Enter the airport's IATA or ICAO code." };
      const airportId = await airportIdByCode(supabase, airportCode);
      if (!airportId) {
        return { error: `No airport matches “${airportCode}”. Check the code.` };
      }
      const { data: existing } = await supabase
        .from("organisation_stations")
        .select("id")
        .eq("organisation_id", organisationId)
        .eq("airport_id", airportId)
        .maybeSingle();
      if (existing) {
        return { error: "You already have a station at that airport." };
      }
      const insert = (row: Record<string, unknown>) =>
        supabase
          .from("organisation_stations")
          .insert({ organisation_id: organisationId, airport_id: airportId, ...row });
      let { error } = await insert(details);
      if (isUnknownColumn(error, "hours")) ({ error } = await insert(withoutHours()));
      if (error) throw error;
    }
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: stationId ? "Station updated." : "Station added." };
}

export async function deleteStationAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const stationId = str(data, "stationId");
  if (!stationId) return { error: "Pick a station first." };

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    await assertOwnStation(supabase, organisationId, stationId);
    // Its scope and desks point at it; clear them so nothing is orphaned.
    await supabase
      .from("organisation_station_scope")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("station_id", stationId);
    await supabase
      .from("organisation_contacts")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("station_id", stationId);
    const { error } = await supabase
      .from("organisation_stations")
      .delete()
      .eq("id", stationId)
      .eq("organisation_id", organisationId);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidateOrg(organisationId);
  return { notice: "Station removed." };
}

function embeddedCode(value: unknown): string | null {
  if (!value) return null;
  const obj = Array.isArray(value) ? value[0] : value;
  const code = (obj as Record<string, unknown> | undefined)?.code;
  return typeof code === "string" ? code : null;
}

// -------------------------------------------------- moderated proposals ---

/**
 * Approvals, scope and stations are regulatory facts taken from the authorities'
 * own registers, so an organisation proposes a change and an admin applies it.
 * Nothing here writes to the scraped tables.
 */
export async function proposeChangeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const target = str(data, "target");
  const action = str(data, "action");
  const targetId = nullable(data, "targetId");
  const note = nullable(data, "note");

  if (!["approval", "scope", "station"].includes(target)) {
    return { error: "Unknown kind of change." };
  }
  if (!["add", "update", "remove"].includes(action)) {
    return { error: "Unknown action." };
  }
  if (action !== "add" && !targetId) {
    return { error: "Nothing selected to change." };
  }

  // Everything else on the form travels as the payload, so one action serves
  // approvals, scope and stations without a branch per field.
  const payload: Record<string, string> = {};
  const reserved = new Set([
    "organisationId",
    "target",
    "action",
    "targetId",
    "note",
  ]);
  for (const [key, value] of data.entries()) {
    if (reserved.has(key) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) payload[key] = trimmed;
  }

  if (action !== "remove" && Object.keys(payload).length === 0) {
    return { error: "Fill in at least one field." };
  }
  if (action === "remove" && !note) {
    return { error: "Say why it should be removed — the reviewer needs a reason." };
  }

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    const { error } = await supabase.from("organisation_change_requests").insert({
      organisation_id: organisationId,
      user_id: user.id,
      target,
      action,
      target_id: targetId,
      payload,
      note,
      status: "pending",
    });
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  return { notice: "Sent for review — you will see it here once it is decided." };
}

export async function withdrawChangeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const requestId = str(data, "requestId");

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("organisation_change_requests")
      .delete()
      .eq("id", requestId)
      .eq("organisation_id", organisationId)
      .eq("status", "pending");
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  return { notice: "Withdrawn." };
}
