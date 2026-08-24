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

export async function saveContactAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const contactId = nullable(data, "contactId");

  const row = {
    organisation_id: organisationId,
    function_label: nullable(data, "functionLabel"),
    name: nullable(data, "name"),
    phone: nullable(data, "phone"),
    email: nullable(data, "email"),
    hours: nullable(data, "hours"),
    sort_order: Number(str(data, "sortOrder") || 0),
  };

  if (!row.function_label && !row.name && !row.phone && !row.email) {
    return { error: "Give the contact at least a label, phone or e-mail." };
  }

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();

    if (contactId) {
      // Scope the update by organisation too, so a swapped id cannot reach
      // another organisation's row.
      const { error } = await supabase
        .from("organisation_managed_contacts")
        .update(row)
        .eq("id", contactId)
        .eq("organisation_id", organisationId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("organisation_managed_contacts")
        .insert(row);
      if (error) throw error;
    }
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: contactId ? "Contact updated." : "Contact added." };
}

export async function deleteContactAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const contactId = str(data, "contactId");

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("organisation_managed_contacts")
      .delete()
      .eq("id", contactId)
      .eq("organisation_id", organisationId);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: "Contact removed." };
}

/**
 * Copy the scraped contacts into the managed table so an organisation can start
 * from what is already published instead of retyping it. Once any managed
 * contact exists, the public card shows the managed set only.
 */
export async function importScrapedContactsAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();

    const { data: existing } = await supabase
      .from("organisation_managed_contacts")
      .select("id")
      .eq("organisation_id", organisationId)
      .limit(1);
    if (existing && existing.length > 0) {
      return { error: "You already have contacts here — import would duplicate them." };
    }

    const { data: scraped, error: readError } = await supabase
      .from("organisation_contacts")
      .select("function_label, label, name, phone, email, hours")
      .eq("organisation_id", organisationId)
      .limit(20);
    if (readError) throw readError;
    if (!scraped || scraped.length === 0) {
      return { error: "There are no scraped contacts to import." };
    }

    const rows = (scraped as Record<string, unknown>[]).map((c, i) => ({
      organisation_id: organisationId,
      function_label:
        (c.function_label as string | null) ?? (c.label as string | null) ?? null,
      name: (c.name as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      hours: (c.hours as string | null) ?? null,
      sort_order: i,
    }));
    const { error } = await supabase
      .from("organisation_managed_contacts")
      .insert(rows);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  return { notice: "Imported — edit them as you like." };
}

// ---------------------------------------------------- station scope ---------

/**
 * Per-station certified scope — the lines shown on the public card for each
 * airport. These publish instantly (the organisation stating what it works at a
 * station, not a fact copied from a register), and they live in their own
 * override table so a re-scrape can never wipe them. For any airport the
 * organisation maintains here, the managed rows replace the scraped station
 * scope on the card entirely — the same rule as managed contacts.
 */

function locationScope(data: FormData, key: string): string | null {
  const v = str(data, key).toLowerCase();
  return v === "line" || v === "base" || v === "both" ? v : null;
}

/** Membership already checked — is this airport actually one of the org's? */
async function orgHasAirport(
  supabase: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  airportId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("organisation_stations")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("airport_id", airportId);
  return ((data as Record<string, unknown>[]) ?? []).map((r) => String(r.id));
}

export async function saveStationScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const airportId = str(data, "airportId");
  const scopeId = nullable(data, "scopeId");
  const scopeText = nullable(data, "scopeText");

  if (!airportId) return { error: "Pick a station first." };
  if (!scopeText) {
    return { error: "Enter the scope line — a class on its own has nothing to show." };
  }

  const row = {
    organisation_id: organisationId,
    airport_id: airportId,
    authority_code: nullable(data, "authorityCode"),
    rating_class_text: nullable(data, "ratingClass"),
    scope_text: scopeText,
    location_scope: locationScope(data, "locationScope"),
    sort_order: Number(str(data, "sortOrder") || 0),
  };

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();

    const stationIds = await orgHasAirport(supabase, organisationId, airportId);
    if (stationIds.length === 0) {
      return { error: "You don't have a station at that airport." };
    }

    if (scopeId) {
      // Scope the update by organisation too, so a swapped id cannot reach
      // another organisation's row.
      const { error } = await supabase
        .from("organisation_managed_station_scope")
        .update(row)
        .eq("id", scopeId)
        .eq("organisation_id", organisationId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("organisation_managed_station_scope")
        .insert(row);
      if (error) throw error;
    }
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: scopeId ? "Scope line updated." : "Scope line added." };
}

export async function deleteStationScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const scopeId = str(data, "scopeId");

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("organisation_managed_station_scope")
      .delete()
      .eq("id", scopeId)
      .eq("organisation_id", organisationId);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: "Scope line removed." };
}

/**
 * Copy the scraped station scope for one airport into the managed table so the
 * organisation can edit from what is already published instead of retyping it.
 * From then on the managed rows are what the card shows for that station.
 */
export async function importStationScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const airportId = str(data, "airportId");

  if (!airportId) return { error: "Pick a station first." };

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();

    const stationIds = await orgHasAirport(supabase, organisationId, airportId);
    if (stationIds.length === 0) {
      return { error: "You don't have a station at that airport." };
    }

    const { data: already } = await supabase
      .from("organisation_managed_station_scope")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("airport_id", airportId)
      .limit(1);
    if (already && already.length > 0) {
      return { error: "You already maintain this station's scope." };
    }

    // Resolve each scraped row to an authority code the same way the card does:
    // by authority_id, else by matching source_url to one of the org's approvals.
    const [scopeRes, apprRes, authRes] = await Promise.all([
      supabase
        .from("organisation_station_scope")
        .select(
          "authority_id, source_url, rating_class_text, rating_class_text_en, scope_text, scope_text_en, location_scope",
        )
        .in("station_id", stationIds)
        .limit(3000),
      supabase
        .from("organisation_approvals")
        .select("source_url, authorities(code)")
        .eq("organisation_id", organisationId),
      supabase.from("authorities").select("id, code"),
    ]);

    const codeById = new Map<string, string>();
    for (const a of (authRes.data as Record<string, unknown>[]) ?? []) {
      if (a.code) codeById.set(String(a.id), String(a.code));
    }
    const codeBySourceUrl = new Map<string, string>();
    for (const ap of (apprRes.data as Record<string, unknown>[]) ?? []) {
      const code = (embeddedCode(ap.authorities) ?? "").trim();
      const url = (ap.source_url as string | null) ?? null;
      if (url && code && !codeBySourceUrl.has(url)) codeBySourceUrl.set(url, code);
    }

    const scraped = (scopeRes.data as Record<string, unknown>[]) ?? [];
    const rows = scraped
      .map((s, i) => {
        const authId = (s.authority_id as string | null) ?? null;
        const url = (s.source_url as string | null) ?? null;
        const code =
          (authId && codeById.get(authId)) ||
          (url && codeBySourceUrl.get(url)) ||
          null;
        const ls = String(s.location_scope ?? "").toLowerCase();
        return {
          organisation_id: organisationId,
          airport_id: airportId,
          authority_code: code,
          rating_class_text:
            (s.rating_class_text_en as string | null) ??
            (s.rating_class_text as string | null) ??
            null,
          scope_text:
            (s.scope_text_en as string | null) ??
            (s.scope_text as string | null) ??
            null,
          location_scope:
            ls === "line" || ls === "base" || ls === "both" ? ls : null,
          sort_order: i,
        };
      })
      .filter((r) => r.scope_text);

    if (rows.length === 0) {
      return {
        error:
          "There is no scraped scope for this station to import — add lines directly.",
      };
    }

    const { error } = await supabase
      .from("organisation_managed_station_scope")
      .insert(rows);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: "Imported — edit the lines as you like." };
}

/** Drop every managed line for one airport, so the card falls back to scraped. */
export async function revertStationScopeAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const airportId = str(data, "airportId");

  if (!airportId) return { error: "Pick a station first." };

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("organisation_managed_station_scope")
      .delete()
      .eq("organisation_id", organisationId)
      .eq("airport_id", airportId);
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: "Reverted to the scraped scope for this station." };
}

// ------------------------------------------------- stations (instant) ------
// Stations publish instantly: an organisation knows which airports it works at,
// and which of them is a base, better than a reviewer does — the same call
// already made for per-station scope. Nothing is written to the scraper-owned
// `organisation_stations`; edits go to `organisation_managed_stations` and are
// merged over the scraped rows at read time. See migration 0004.

/** A checkbox is absent from the form data entirely when unticked. */
function bool(data: FormData, key: string): boolean {
  const v = data.get(key);
  return v === "on" || v === "true" || v === "1";
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

/** "…table not found" from PostgREST means 0004 hasn't been applied yet. */
function missingStationsTable(err: unknown): boolean {
  const m = err && typeof err === "object" && "message" in err
    ? String((err as { message: unknown }).message)
    : "";
  return /organisation_managed_stations/i.test(m) &&
    /(does not exist|not find|schema cache)/i.test(m);
}

const MIGRATION_HINT =
  "Station editing needs migration 0004 (organisation_managed_stations) — apply it in the Supabase SQL editor first.";

export async function saveStationAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  // An existing station is edited by airport (the pair the override keys on);
  // a new one is named by its IATA/ICAO code.
  const knownAirportId = str(data, "airportId");
  const airportCode = str(data, "airportCode");

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();

    let airportId = knownAirportId;
    if (!airportId) {
      if (!airportCode) return { error: "Enter the airport's IATA or ICAO code." };
      const found = await airportIdByCode(supabase, airportCode);
      if (!found) {
        return { error: `No airport matches “${airportCode}”. Check the code.` };
      }
      airportId = found;
    }

    const { error } = await supabase.from("organisation_managed_stations").upsert(
      {
        organisation_id: organisationId,
        airport_id: airportId,
        address: nullable(data, "address"),
        phone: nullable(data, "phone"),
        email: nullable(data, "email"),
        is_base: bool(data, "isBase"),
        removed: false,
      },
      { onConflict: "organisation_id,airport_id" },
    );
    if (error) throw error;
  } catch (err) {
    if (missingStationsTable(err)) return { error: MIGRATION_HINT };
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: knownAirportId ? "Station updated." : "Station added." };
}

export async function deleteStationAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const organisationId = str(data, "organisationId");
  const airportId = str(data, "airportId");

  if (!airportId) return { error: "Pick a station first." };

  try {
    await requireMember(user, organisationId);
    const supabase = getAdminSupabase();
    // A tombstone, not a delete: the scraped row stays and would come back on
    // the next run, so removal has to be recorded rather than applied.
    const { error } = await supabase.from("organisation_managed_stations").upsert(
      {
        organisation_id: organisationId,
        airport_id: airportId,
        removed: true,
      },
      { onConflict: "organisation_id,airport_id" },
    );
    if (error) throw error;
  } catch (err) {
    if (missingStationsTable(err)) return { error: MIGRATION_HINT };
    return { error: toMessage(err) };
  }

  revalidatePath(`/dashboard/${organisationId}`);
  revalidatePath("/");
  return { notice: "Station removed from your listing." };
}

/** PostgREST returns an embedded relation as an object or a one-element array. */
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
