"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/guards";
import { getAdminSupabase } from "@/lib/supabase";

export interface AdminState {
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
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Something went wrong.";
}

// ---------------------------------------------------------------- claims ---

/**
 * Approve a claim.
 *
 * For a `new` claim there is no organisation yet, so one is created from the
 * proposed fields first — it then behaves like any scraped organisation, except
 * that a later scrape run will enrich rather than replace it.
 */
export async function approveClaimAction(
  _prev: AdminState,
  data: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin();
  const claimId = str(data, "claimId");
  const note = nullable(data, "reviewNote");
  const supabase = getAdminSupabase();

  try {
    const { data: claim, error: readError } = await supabase
      .from("organisation_claims")
      .select("*")
      .eq("id", claimId)
      .maybeSingle();
    if (readError) throw readError;
    if (!claim) return { error: "That claim no longer exists." };
    if (claim.status !== "pending") {
      return { error: "That claim has already been decided." };
    }

    let organisationId = claim.organisation_id as string | null;

    if (claim.kind === "new") {
      const { data: created, error: createError } = await supabase
        .from("organisations")
        .insert({
          name: claim.proposed_name,
          legal_name: claim.proposed_legal_name,
          country_code: claim.proposed_country_code,
          website: claim.proposed_website,
          address: claim.proposed_address,
        })
        .select("id")
        .single();
      if (createError) throw createError;
      organisationId = String(created.id);
    }

    if (!organisationId) return { error: "This claim has no organisation." };

    const { error: memberError } = await supabase
      .from("organisation_members")
      .upsert(
        {
          organisation_id: organisationId,
          user_id: claim.user_id,
          role: "owner",
        },
        { onConflict: "organisation_id,user_id" },
      );
    if (memberError) throw memberError;

    const { error: updateError } = await supabase
      .from("organisation_claims")
      .update({
        status: "approved",
        organisation_id: organisationId,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        review_note: note,
      })
      .eq("id", claimId);
    if (updateError) throw updateError;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { notice: "Approved." };
}

export async function rejectClaimAction(
  _prev: AdminState,
  data: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin();
  const claimId = str(data, "claimId");
  const note = nullable(data, "reviewNote");

  if (!note) {
    return { error: "Give a reason — the applicant sees it." };
  }

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("organisation_claims")
      .update({
        status: "rejected",
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        review_note: note,
      })
      .eq("id", claimId)
      .eq("status", "pending");
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath("/admin");
  return { notice: "Rejected." };
}

// -------------------------------------------------------- change requests ---

/** Look an authority up by its code, e.g. 'EASA'. */
async function authorityIdByCode(code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("authorities")
    .select("id")
    .ilike("code", code.trim())
    .maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

async function airportIdByCode(code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const supabase = getAdminSupabase();
  const c = code.trim().toUpperCase();
  const { data } = await supabase
    .from("airports")
    .select("id")
    .or(`iata_code.eq.${c},icao_code.eq.${c}`)
    .limit(1)
    .maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

/**
 * Apply a proposed change to the scraped tables.
 *
 * Note for whoever maintains `data_scraper`: these rows live in the tables the
 * scraper owns, so a later run can overwrite them. Approvals/scope corrections
 * should be re-checked after a re-scrape, or the scraper taught to leave rows
 * it did not produce alone.
 */
export async function approveChangeAction(
  _prev: AdminState,
  data: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin();
  const requestId = str(data, "requestId");
  const note = nullable(data, "reviewNote");
  const supabase = getAdminSupabase();

  try {
    const { data: req, error: readError } = await supabase
      .from("organisation_change_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (readError) throw readError;
    if (!req) return { error: "That request no longer exists." };
    if (req.status !== "pending") return { error: "Already decided." };

    const payload = (req.payload ?? {}) as Record<string, string>;
    const orgId = String(req.organisation_id);

    if (req.target === "approval") {
      await applyApproval(req.action as string, orgId, req.target_id as string | null, payload);
    } else if (req.target === "scope") {
      await applyScope(req.action as string, orgId, req.target_id as string | null, payload);
    } else if (req.target === "station") {
      await applyStation(req.action as string, orgId, req.target_id as string | null, payload);
    }

    const { error: updateError } = await supabase
      .from("organisation_change_requests")
      .update({
        status: "approved",
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        review_note: note,
      })
      .eq("id", requestId);
    if (updateError) throw updateError;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { notice: "Applied and published." };
}

async function applyApproval(
  action: string,
  orgId: string,
  targetId: string | null,
  p: Record<string, string>,
): Promise<void> {
  const supabase = getAdminSupabase();

  if (action === "remove") {
    if (!targetId) throw new Error("No approval selected");
    const { error } = await supabase
      .from("organisation_approvals")
      .delete()
      .eq("id", targetId)
      .eq("organisation_id", orgId);
    if (error) throw error;
    return;
  }

  const authorityId = await authorityIdByCode(p.authorityCode);
  const row: Record<string, unknown> = {
    organisation_id: orgId,
    ...(authorityId ? { authority_id: authorityId } : {}),
    ...(p.approvalType ? { approval_type: p.approvalType } : {}),
    ...(p.approvalReference ? { approval_reference: p.approvalReference } : {}),
    ...(p.validUntil ? { valid_until: p.validUntil } : {}),
    ...(p.sourceUrl ? { source_url: p.sourceUrl } : {}),
    ...(p.ratings
      ? {
          ratings: p.ratings
            .split(",")
            .map((r) => r.trim())
            .filter(Boolean),
        }
      : {}),
  };

  if (action === "add") {
    if (!row.approval_type) row.approval_type = "Part-145";
    const { error } = await supabase.from("organisation_approvals").insert(row);
    if (error) throw error;
    return;
  }

  if (!targetId) throw new Error("No approval selected");
  const { error } = await supabase
    .from("organisation_approvals")
    .update(row)
    .eq("id", targetId)
    .eq("organisation_id", orgId);
  if (error) throw error;
}

async function applyScope(
  action: string,
  orgId: string,
  targetId: string | null,
  p: Record<string, string>,
): Promise<void> {
  const supabase = getAdminSupabase();

  if (action === "remove") {
    if (!targetId) {
      // Scope removals are usually described in prose rather than pointing at a
      // row; the admin note records what to take out.
      throw new Error(
        "This scope removal names no row — delete it by hand, then approve.",
      );
    }
    const { error } = await supabase
      .from("organisation_scope")
      .delete()
      .eq("id", targetId)
      .eq("organisation_id", orgId);
    if (error) throw error;
    return;
  }

  const authorityId = await authorityIdByCode(p.authorityCode);
  const scopeText = p.scopeText ?? "";
  const row: Record<string, unknown> = {
    organisation_id: orgId,
    ...(authorityId ? { authority_id: authorityId } : {}),
    ...(p.ratingClass
      ? { rating_class_text: p.ratingClass, rating_class_text_en: p.ratingClass }
      : {}),
    ...(scopeText ? { scope_text: scopeText, scope_text_en: scopeText } : {}),
    ...(p.locationScope ? { location_scope: p.locationScope.toLowerCase() } : {}),
  };

  if (action === "add") {
    const { error } = await supabase.from("organisation_scope").insert(row);
    if (error) throw error;
    return;
  }

  if (!targetId) throw new Error("No scope row selected");
  const { error } = await supabase
    .from("organisation_scope")
    .update(row)
    .eq("id", targetId)
    .eq("organisation_id", orgId);
  if (error) throw error;
}

async function applyStation(
  action: string,
  orgId: string,
  targetId: string | null,
  p: Record<string, string>,
): Promise<void> {
  const supabase = getAdminSupabase();

  if (action === "remove") {
    if (!targetId) throw new Error("No station selected");
    const { error } = await supabase
      .from("organisation_stations")
      .delete()
      .eq("id", targetId)
      .eq("organisation_id", orgId);
    if (error) throw error;
    return;
  }

  const airportId = await airportIdByCode(p.airportCode);
  const row: Record<string, unknown> = {
    organisation_id: orgId,
    ...(airportId ? { airport_id: airportId } : {}),
    ...(p.address ? { address: p.address } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.email ? { email: p.email } : {}),
  };

  if (action === "add") {
    if (!airportId) {
      throw new Error(
        `No airport matches "${p.airportCode ?? ""}" — fix the code and try again.`,
      );
    }
    const { error } = await supabase.from("organisation_stations").insert(row);
    if (error) throw error;
    return;
  }

  if (!targetId) throw new Error("No station selected");
  const { error } = await supabase
    .from("organisation_stations")
    .update(row)
    .eq("id", targetId)
    .eq("organisation_id", orgId);
  if (error) throw error;
}

export async function rejectChangeAction(
  _prev: AdminState,
  data: FormData,
): Promise<AdminState> {
  const admin = await requireAdmin();
  const requestId = str(data, "requestId");
  const note = nullable(data, "reviewNote");

  if (!note) return { error: "Give a reason — the organisation sees it." };

  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase
      .from("organisation_change_requests")
      .update({
        status: "rejected",
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        review_note: note,
      })
      .eq("id", requestId)
      .eq("status", "pending");
    if (error) throw error;
  } catch (err) {
    return { error: toMessage(err) };
  }

  revalidatePath("/admin");
  return { notice: "Rejected." };
}
