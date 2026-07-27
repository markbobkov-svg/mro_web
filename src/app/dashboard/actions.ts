"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getOrganisationDomains } from "@/lib/dashboard";
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

  const { data: existingMember } = await supabase
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", user.id)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (existingMember) redirect(`/dashboard/${organisationId}`);

  const { data: openClaim } = await supabase
    .from("organisation_claims")
    .select("id")
    .eq("user_id", user.id)
    .eq("organisation_id", organisationId)
    .eq("status", "pending")
    .maybeSingle();
  if (openClaim) {
    return { error: "You already have a claim pending on this organisation." };
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
