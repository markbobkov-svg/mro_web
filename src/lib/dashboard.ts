import "server-only";

import { getAdminSupabase } from "./supabase";
import { acceptableDomains } from "./domains";

/**
 * Reads for the organisation dashboard and the admin queue.
 *
 * Nothing here checks permissions — callers must have gone through
 * `requireMember` / `requireAdmin` in guards.ts first.
 */

export interface OrgProfile {
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  aogPhone: string | null;
  aogEmail: string | null;
  updatedAt: string | null;
}

export interface ManagedContact {
  id: string;
  functionLabel: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  hours: string | null;
  sortOrder: number;
}

export interface DashboardApproval {
  id: string;
  authorityCode: string;
  authorityName: string | null;
  approvalType: string;
  reference: string | null;
  ratings: string[];
  validUntil: string | null;
  sourceUrl: string | null;
}

export interface DashboardScopeRow {
  id: string;
  authorityCode: string;
  ratingClass: string | null;
  ratingText: string | null;
  scopeText: string | null;
  locationScope: string | null;
}

export interface DashboardStation {
  id: string;
  airportId: string | null;
  airportName: string | null;
  iata: string | null;
  icao: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface ChangeRequest {
  id: string;
  organisationId: string;
  organisationName?: string;
  userId: string;
  userEmail?: string;
  target: "approval" | "scope" | "station";
  action: "add" | "update" | "remove";
  targetId: string | null;
  payload: Record<string, unknown>;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ClaimRow {
  id: string;
  userId: string;
  userEmail: string | null;
  kind: "existing" | "new";
  organisationId: string | null;
  organisationName: string | null;
  proposedName: string | null;
  proposedLegalName: string | null;
  proposedCountryCode: string | null;
  proposedWebsite: string | null;
  proposedAddress: string | null;
  proposedApprovalRef: string | null;
  contactNote: string | null;
  status: "pending" | "approved" | "rejected";
  autoVerified: boolean;
  matchedDomain: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  legalName: string | null;
  countryCode: string | null;
  website: string | null;
  /** Already spoken for — the UI greys these out. */
  claimed: boolean;
  /** Domains that would let this claim skip the manual queue. */
  domains: string[];
}

/** Type-ahead over organisation names for the claim page. */
export async function searchOrganisations(
  query: string,
  limit = 12,
): Promise<OrgSummary[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = getAdminSupabase();
  const escaped = q.replace(/[%_,()]/g, " ").trim();
  if (!escaped) return [];

  const { data, error } = await supabase
    .from("organisations")
    .select("id, name, legal_name, country_code, website, email")
    .or(`name.ilike.%${escaped}%,legal_name.ilike.%${escaped}%`)
    .order("name")
    .limit(limit);
  if (error) throw new Error(`searchOrganisations: ${error.message}`);

  const rows = (data as Record<string, unknown>[]) ?? [];
  const ids = rows.map((r) => String(r.id));
  const claimed = await getClaimedOrgIds(ids);

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? "Unnamed"),
    legalName: (r.legal_name as string | null) ?? null,
    countryCode: (r.country_code as string | null) ?? null,
    website: (r.website as string | null) ?? null,
    claimed: claimed.has(String(r.id)),
    domains: acceptableDomains(r.website as string | null, [
      r.email as string | null,
    ]),
  }));
}

async function getClaimedOrgIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("organisation_members")
    .select("organisation_id")
    .in("organisation_id", ids);
  return new Set(
    ((data as Record<string, unknown>[]) ?? []).map((r) =>
      String(r.organisation_id),
    ),
  );
}

/**
 * Which domains an email must be on to auto-verify a claim for this
 * organisation: its website, plus corporate domains already in its contacts.
 */
export async function getOrganisationDomains(orgId: string): Promise<string[]> {
  const supabase = getAdminSupabase();
  const [{ data: org }, { data: contacts }] = await Promise.all([
    supabase
      .from("organisations")
      .select("website, email")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("organisation_contacts")
      .select("email")
      .eq("organisation_id", orgId)
      .not("email", "is", null)
      .limit(50),
  ]);

  const contactEmails = ((contacts as Record<string, unknown>[]) ?? []).map(
    (c) => c.email as string | null,
  );
  return acceptableDomains(
    (org as Record<string, unknown> | null)?.website as string | null,
    [
      (org as Record<string, unknown> | null)?.email as string | null,
      ...contactEmails,
    ],
  );
}

export interface DashboardOrg {
  id: string;
  name: string;
  legalName: string | null;
  countryCode: string | null;
  /** Scraped values — shown as the fallback under each override field. */
  scraped: {
    website: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  profile: OrgProfile | null;
  contacts: ManagedContact[];
  scrapedContacts: ManagedContact[];
  approvals: DashboardApproval[];
  scope: DashboardScopeRow[];
  stations: DashboardStation[];
  changeRequests: ChangeRequest[];
}

/** Everything the dashboard shows for one organisation. */
export async function getDashboardOrg(orgId: string): Promise<DashboardOrg | null> {
  const supabase = getAdminSupabase();

  const [orgRes, profileRes, contactsRes, scrapedContactsRes, approvalsRes, scopeRes, stationsRes, crRes] =
    await Promise.all([
      supabase
        .from("organisations")
        .select("id, name, legal_name, country_code, website, email, phone, address")
        .eq("id", orgId)
        .maybeSingle(),
      supabase
        .from("organisation_profiles")
        .select("*")
        .eq("organisation_id", orgId)
        .maybeSingle(),
      supabase
        .from("organisation_managed_contacts")
        .select("*")
        .eq("organisation_id", orgId)
        .order("sort_order"),
      supabase
        .from("organisation_contacts")
        .select("id, function_label, label, name, phone, email, hours")
        .eq("organisation_id", orgId)
        .limit(30),
      supabase
        .from("organisation_approvals")
        .select(
          "id, approval_type, approval_reference, ratings, valid_until, source_url, authorities(code, name)",
        )
        .eq("organisation_id", orgId),
      supabase
        .from("organisation_scope")
        .select(
          "id, rating_class_text_en, rating_class_text, rating_text_en, rating_text, scope_text_en, scope_text, location_scope, authorities(code)",
        )
        .eq("organisation_id", orgId)
        .limit(400),
      supabase
        .from("organisation_stations")
        .select("id, airport_id, address, phone, email, airports(name, iata_code, icao_code)")
        .eq("organisation_id", orgId),
      supabase
        .from("organisation_change_requests")
        .select("*")
        .eq("organisation_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const org = orgRes.data as Record<string, unknown> | null;
  if (!org) return null;

  const p = profileRes.data as Record<string, unknown> | null;

  return {
    id: String(org.id),
    name: String(org.name ?? "Unnamed"),
    legalName: (org.legal_name as string | null) ?? null,
    countryCode: (org.country_code as string | null) ?? null,
    scraped: {
      website: (org.website as string | null) ?? null,
      email: (org.email as string | null) ?? null,
      phone: (org.phone as string | null) ?? null,
      address: (org.address as string | null) ?? null,
    },
    profile: p
      ? {
          tagline: (p.tagline as string | null) ?? null,
          description: (p.description as string | null) ?? null,
          logoUrl: (p.logo_url as string | null) ?? null,
          website: (p.website as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          phone: (p.phone as string | null) ?? null,
          address: (p.address as string | null) ?? null,
          aogPhone: (p.aog_phone as string | null) ?? null,
          aogEmail: (p.aog_email as string | null) ?? null,
          updatedAt: (p.updated_at as string | null) ?? null,
        }
      : null,
    contacts: ((contactsRes.data as Record<string, unknown>[]) ?? []).map((c) => ({
      id: String(c.id),
      functionLabel: (c.function_label as string | null) ?? null,
      name: (c.name as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      hours: (c.hours as string | null) ?? null,
      sortOrder: Number(c.sort_order ?? 0),
    })),
    scrapedContacts: ((scrapedContactsRes.data as Record<string, unknown>[]) ?? []).map(
      (c) => ({
        id: String(c.id),
        functionLabel:
          (c.function_label as string | null) ?? (c.label as string | null) ?? null,
        name: (c.name as string | null) ?? null,
        phone: (c.phone as string | null) ?? null,
        email: (c.email as string | null) ?? null,
        hours: (c.hours as string | null) ?? null,
        sortOrder: 0,
      }),
    ),
    approvals: ((approvalsRes.data as Record<string, unknown>[]) ?? []).map((a) => {
      const auth = embedded(a.authorities);
      return {
        id: String(a.id),
        authorityCode: String(auth?.code ?? "Other"),
        authorityName: (auth?.name as string | null) ?? null,
        approvalType: String(a.approval_type ?? ""),
        reference: (a.approval_reference as string | null) ?? null,
        ratings: Array.isArray(a.ratings) ? (a.ratings as string[]) : [],
        validUntil: (a.valid_until as string | null) ?? null,
        sourceUrl: (a.source_url as string | null) ?? null,
      };
    }),
    scope: ((scopeRes.data as Record<string, unknown>[]) ?? []).map((s) => ({
      id: String(s.id),
      authorityCode: String(embedded(s.authorities)?.code ?? "Other"),
      ratingClass:
        (s.rating_class_text_en as string | null) ??
        (s.rating_class_text as string | null) ??
        null,
      ratingText:
        (s.rating_text_en as string | null) ?? (s.rating_text as string | null) ?? null,
      scopeText:
        (s.scope_text_en as string | null) ?? (s.scope_text as string | null) ?? null,
      locationScope: (s.location_scope as string | null) ?? null,
    })),
    stations: ((stationsRes.data as Record<string, unknown>[]) ?? []).map((st) => {
      const ap = embedded(st.airports);
      return {
        id: String(st.id),
        airportId: (st.airport_id as string | null) ?? null,
        airportName: (ap?.name as string | null) ?? null,
        iata: (ap?.iata_code as string | null) ?? null,
        icao: (ap?.icao_code as string | null) ?? null,
        address: (st.address as string | null) ?? null,
        phone: (st.phone as string | null) ?? null,
        email: (st.email as string | null) ?? null,
      };
    }),
    changeRequests: ((crRes.data as Record<string, unknown>[]) ?? []).map(readChangeRequest),
  };
}

/** PostgREST returns embedded relations as an object or a one-element array. */
function embedded(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  return value as Record<string, unknown>;
}

function readChangeRequest(r: Record<string, unknown>): ChangeRequest {
  return {
    id: String(r.id),
    organisationId: String(r.organisation_id),
    userId: String(r.user_id),
    target: r.target as ChangeRequest["target"],
    action: r.action as ChangeRequest["action"],
    targetId: (r.target_id as string | null) ?? null,
    payload: (r.payload as Record<string, unknown>) ?? {},
    note: (r.note as string | null) ?? null,
    status: r.status as ChangeRequest["status"],
    reviewNote: (r.review_note as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
    reviewedAt: (r.reviewed_at as string | null) ?? null,
  };
}

/** Claims filed by one user, newest first. */
export async function getUserClaims(userId: string): Promise<ClaimRow[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("organisation_claims")
    .select("*, organisations(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getUserClaims: ${error.message}`);
  return ((data as Record<string, unknown>[]) ?? []).map((r) =>
    readClaim(r, null),
  );
}

/** The admin queue: claims still awaiting a decision. */
export async function getPendingClaims(): Promise<ClaimRow[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("organisation_claims")
    .select("*, organisations(name), app_users(email)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getPendingClaims: ${error.message}`);

  return ((data as Record<string, unknown>[]) ?? []).map((r) =>
    readClaim(r, (embedded(r.app_users)?.email as string | null) ?? null),
  );
}

function readClaim(r: Record<string, unknown>, email: string | null): ClaimRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    userEmail: email,
    kind: (r.kind as ClaimRow["kind"]) ?? "existing",
    organisationId: (r.organisation_id as string | null) ?? null,
    organisationName: (embedded(r.organisations)?.name as string | null) ?? null,
    proposedName: (r.proposed_name as string | null) ?? null,
    proposedLegalName: (r.proposed_legal_name as string | null) ?? null,
    proposedCountryCode: (r.proposed_country_code as string | null) ?? null,
    proposedWebsite: (r.proposed_website as string | null) ?? null,
    proposedAddress: (r.proposed_address as string | null) ?? null,
    proposedApprovalRef: (r.proposed_approval_ref as string | null) ?? null,
    contactNote: (r.contact_note as string | null) ?? null,
    status: (r.status as ClaimRow["status"]) ?? "pending",
    autoVerified: Boolean(r.auto_verified),
    matchedDomain: (r.matched_domain as string | null) ?? null,
    reviewNote: (r.review_note as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

/** The admin queue: proposed changes to regulatory data. */
export async function getPendingChangeRequests(): Promise<ChangeRequest[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("organisation_change_requests")
    .select("*, organisations(name), app_users(email)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getPendingChangeRequests: ${error.message}`);

  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    ...readChangeRequest(r),
    organisationName: (embedded(r.organisations)?.name as string | null) ?? undefined,
    userEmail: (embedded(r.app_users)?.email as string | null) ?? undefined,
  }));
}
