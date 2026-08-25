import "server-only";

import { getAdminSupabase } from "./supabase";
import { acceptableDomains } from "./domains";

/**
 * Reads for the organisation dashboard and the admin queue.
 *
 * Nothing here checks permissions — callers must have gone through
 * `requireMember` / `requireAdmin` in guards.ts first.
 */

/**
 * What the Profile tab maintains — columns on `organisations` itself since
 * migration 0007. No phone / e-mail / AOG: every way of reaching a person is a
 * desk in `organisation_contacts` (0006 dropped those columns).
 */
export interface OrgProfile {
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  address: string | null;
  updatedAt: string | null;
}

/**
 * A contact desk — the only place a phone or an e-mail lives (0008 dropped the
 * columns on `organisations` and `organisation_stations`). `stationId` ties one
 * to the station it answers for; without it the desk is organisation-wide and
 * stands in wherever a station has none of its own.
 */
export interface DashboardContact {
  id: string;
  stationId: string | null;
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

export interface DashboardStation {
  id: string;
  airportId: string | null;
  airportName: string | null;
  iata: string | null;
  icao: string | null;
  address: string | null;
  /** A main base for the organisation, not just a line station. */
  isBase: boolean;
  /** Desks for this station. Empty means the organisation-wide ones stand in. */
  contacts: DashboardContact[];
  /** What this station is certified to work — organisation_station_scope. */
  scope: DashboardScopeLine[];
}

/**
 * One certified-scope line. The same shape serves the organisation's own scope
 * (`organisation_scope`) and a station's (`organisation_station_scope`); each
 * line points at the approval it is certified under.
 */
export interface DashboardScopeLine {
  id: string;
  approvalId: string | null;
  authorityCode: string | null;
  ratingClass: string | null;
  scopeText: string | null;
  locationScope: string | null;
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
    .select("id, name, country_code, website")
    .ilike("name", `%${escaped}%`)
    .order("name")
    .limit(limit);
  if (error) throw new Error(`searchOrganisations: ${error.message}`);

  const rows = (data as Record<string, unknown>[]) ?? [];
  const ids = rows.map((r) => String(r.id));
  const claimed = await getClaimedOrgIds(ids);

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? "Unnamed"),
    countryCode: (r.country_code as string | null) ?? null,
    website: (r.website as string | null) ?? null,
    claimed: claimed.has(String(r.id)),
    domains: acceptableDomains(r.website as string | null, []),
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
      .select("website")
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
  // organisations.email is gone (0008). Nothing is lost: the migration turned
  // it into an organisation-wide desk, so it reaches this list via contacts.
  return acceptableDomains(
    (org as Record<string, unknown> | null)?.website as string | null,
    contactEmails,
  );
}

/** Everything the dashboard shows for one organisation. */
export interface DashboardOrg {
  id: string;
  name: string;
  countryCode: string | null;
  /**
   * The editable profile. No longer nullable and no separate `scraped` block:
   * since 0007 these are columns on `organisations`, so the scraped value and
   * the organisation's own edit are the same field — whoever wrote last.
   */
  profile: OrgProfile;
  approvals: DashboardApproval[];
  /** Stations, each carrying its own desks and certified scope. */
  stations: DashboardStation[];
  /** The organisation's own certified scope — organisation_scope. */
  orgScope: DashboardScopeLine[];
  /**
   * Desks with no station, maintained on the Profile tab. They stand in at any
   * station that has no desks of its own — see getAirportDetail.
   */
  orgContacts: DashboardContact[];
  changeRequests: ChangeRequest[];
}

export interface AuthorityOption {
  code: string;
  name: string | null;
}

/**
 * The authorities register (EASA, FAA, UK-CAA, …) for the approval dropdown in
 * the dashboard — so an organisation picks a real authority code rather than
 * free-typing one. EASA sorts first, the rest by code.
 */
export async function getAuthorities(): Promise<AuthorityOption[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from("authorities").select("code, name");
  if (error || !data) return [];
  const rows = (data as { code: string | null; name: string | null }[])
    .filter((a) => a.code)
    .map((a) => ({ code: String(a.code), name: a.name ?? null }));
  rows.sort((a, b) =>
    a.code === "EASA" ? -1 : b.code === "EASA" ? 1 : a.code.localeCompare(b.code),
  );
  return rows;
}

export async function getDashboardOrg(orgId: string): Promise<DashboardOrg | null> {
  const supabase = getAdminSupabase();

  // A claimed organisation owns its rows outright now: everything below reads
  // the real tables the map reads, and the dashboard writes back to them. There
  // is no override layer to merge any more (see migration 0005).
  const [
    orgRes,
    approvalsRes,
    stationsRes,
    contactsRes,
    orgScopeRes,
    stationScopeRes,
    crRes,
  ] = await Promise.all([
    // `*` because the profile columns (tagline, description, logo_url,
    // profile_updated_at) arrive with migration 0007: naming one that is not
    // there yet would fail the whole read and empty the dashboard.
    supabase
      .from("organisations")
      .select("*")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("organisation_approvals")
      .select(
        "id, approval_type, approval_reference, ratings, valid_until, source_url, authorities(code, name)",
      )
      .eq("organisation_id", orgId),
    supabase
      .from("organisation_stations")
      .select(
        "id, airport_id, address, is_base, airports(name, iata_code, icao_code)",
      )
      .eq("organisation_id", orgId),
    supabase
      .from("organisation_contacts")
      .select(
        "id, station_id, function_label, label, name, phone, email, hours, sort_order",
      )
      .eq("organisation_id", orgId)
      .limit(500),
    supabase
      .from("organisation_scope")
      .select(
        "id, organisation_approval_id, authority_text, rating_class_text, rating_class_text_en, scope_text, scope_text_en, location_scope, authorities(code)",
      )
      .eq("organisation_id", orgId)
      .limit(3000),
    supabase
      .from("organisation_station_scope")
      .select(
        "id, station_id, organisation_approval_id, authority_text, rating_class_text, rating_class_text_en, scope_text, scope_text_en, location_scope, authorities(code)",
      )
      .eq("organisation_id", orgId)
      .limit(5000),
    supabase
      .from("organisation_change_requests")
      .select("*")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const org = orgRes.data as Record<string, unknown> | null;
  if (!org) return null;

  const readContact = (c: Record<string, unknown>): DashboardContact => ({
    id: String(c.id),
    stationId: (c.station_id as string | null) ?? null,
    functionLabel:
      (c.function_label as string | null) ?? (c.label as string | null) ?? null,
    name: (c.name as string | null) ?? null,
    phone: (c.phone as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    hours: (c.hours as string | null) ?? null,
    sortOrder: Number(c.sort_order ?? 0),
  });

  const readScope = (s: Record<string, unknown>): DashboardScopeLine => ({
    id: String(s.id),
    approvalId: (s.organisation_approval_id as string | null) ?? null,
    authorityCode:
      (embedded(s.authorities)?.code as string | null) ??
      (s.authority_text as string | null) ??
      null,
    ratingClass:
      (s.rating_class_text_en as string | null) ??
      (s.rating_class_text as string | null) ??
      null,
    scopeText:
      (s.scope_text_en as string | null) ?? (s.scope_text as string | null) ?? null,
    locationScope: (s.location_scope as string | null) ?? null,
  });

  const byOrder = (a: { sortOrder: number }, b: { sortOrder: number }) =>
    a.sortOrder - b.sortOrder;

  // Contacts split by what they answer for: a station's own desks, and the
  // organisation-wide ones the Profile tab maintains, which stand in wherever a
  // station has none. Migration 0006 attached the station-less desks a claimed
  // organisation had from the old model to a station; anything left here is
  // either scraped or was entered on the Profile tab since.
  const contactsByStation = new Map<string, DashboardContact[]>();
  const orgContacts: DashboardContact[] = [];
  for (const raw of (contactsRes.data as Record<string, unknown>[]) ?? []) {
    const c = readContact(raw);
    if (!c.stationId) {
      orgContacts.push(c);
      continue;
    }
    const list = contactsByStation.get(c.stationId) ?? [];
    list.push(c);
    contactsByStation.set(c.stationId, list);
  }
  for (const list of contactsByStation.values()) list.sort(byOrder);
  orgContacts.sort(byOrder);

  // Per-station scope, grouped by the station it belongs to.
  const scopeByStation = new Map<string, DashboardScopeLine[]>();
  for (const raw of (stationScopeRes.data as Record<string, unknown>[]) ?? []) {
    const stationId = raw.station_id ? String(raw.station_id) : null;
    if (!stationId) continue;
    const list = scopeByStation.get(stationId) ?? [];
    list.push(readScope(raw));
    scopeByStation.set(stationId, list);
  }

  const stations: DashboardStation[] = (
    (stationsRes.data as Record<string, unknown>[]) ?? []
  ).map((st) => {
    const ap = embedded(st.airports);
    const id = String(st.id);
    return {
      id,
      airportId: (st.airport_id as string | null) ?? null,
      airportName: (ap?.name as string | null) ?? null,
      iata: (ap?.iata_code as string | null) ?? null,
      icao: (ap?.icao_code as string | null) ?? null,
      address: (st.address as string | null) ?? null,
      isBase: st.is_base === true,
      contacts: contactsByStation.get(id) ?? [],
      scope: scopeByStation.get(id) ?? [],
    };
  });
  stations.sort((a, b) =>
    (a.iata ?? a.icao ?? a.airportName ?? "").localeCompare(
      b.iata ?? b.icao ?? b.airportName ?? "",
    ),
  );

  return {
    id: String(org.id),
    name: String(org.name ?? "Unnamed"),
    countryCode: (org.country_code as string | null) ?? null,
    profile: {
      tagline: (org.tagline as string | null) ?? null,
      description: (org.description as string | null) ?? null,
      logoUrl: (org.logo_url as string | null) ?? null,
      website: (org.website as string | null) ?? null,
      address: (org.address as string | null) ?? null,
      updatedAt: (org.profile_updated_at as string | null) ?? null,
    },
    approvals: ((approvalsRes.data as Record<string, unknown>[]) ?? []).map((a) => {
      const auth = embedded(a.authorities);
      return {
        id: String(a.id),
        authorityCode: String(auth?.code ?? "—"),
        authorityName: (auth?.name as string | null) ?? null,
        approvalType: String(a.approval_type ?? ""),
        reference: (a.approval_reference as string | null) ?? null,
        ratings: Array.isArray(a.ratings) ? (a.ratings as string[]) : [],
        validUntil: (a.valid_until as string | null) ?? null,
        sourceUrl: (a.source_url as string | null) ?? null,
      };
    }),
    stations,
    orgScope: ((orgScopeRes.data as Record<string, unknown>[]) ?? []).map(readScope),
    orgContacts,
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

/**
 * One account, one organisation — what this account already holds.
 *
 * `membershipOrgId` is the organisation it manages, if any: membership covers
 * both roles, `owner` and `editor`, so either lands straight on that listing.
 * `hasActiveClaim` is true when a claim is still pending or already approved.
 *
 * The claim flow is gated on this everywhere — the dashboard redirects a member
 * to its organisation and hides the claim button once a claim exists, the claim
 * page redirects, and the claim actions refuse a second one. A *rejected* claim
 * does not count: it left the account with nothing, so a fresh attempt is fine.
 */
export interface OrganisationHold {
  membershipOrgId: string | null;
  hasActiveClaim: boolean;
}

export async function getOrganisationHold(
  userId: string,
): Promise<OrganisationHold> {
  const supabase = getAdminSupabase();
  const [membersRes, claimsRes] = await Promise.all([
    supabase
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", userId)
      .limit(1),
    supabase
      .from("organisation_claims")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"])
      .limit(1),
  ]);

  const memberRows = (membersRes.data as Record<string, unknown>[]) ?? [];
  const claimRows = (claimsRes.data as Record<string, unknown>[]) ?? [];

  return {
    membershipOrgId:
      memberRows.length > 0 ? String(memberRows[0].organisation_id) : null,
    hasActiveClaim: claimRows.length > 0,
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

/**
 * Look up the e-mail for a set of accounts.
 *
 * Claims and change requests key on `auth.users`, and `app_users` keys on the
 * same ids without a foreign key between the two — so PostgREST cannot embed
 * one in the other and this second query is how the reviewer sees who asked.
 */
async function emailsByUserId(
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("app_users")
    .select("id, email")
    .in("id", ids);

  return new Map(
    ((data as Record<string, unknown>[]) ?? []).map((u) => [
      String(u.id),
      String(u.email ?? ""),
    ]),
  );
}

/** The admin queue: claims still awaiting a decision. */
export async function getPendingClaims(): Promise<ClaimRow[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("organisation_claims")
    .select("*, organisations(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getPendingClaims: ${error.message}`);

  const rows = (data as Record<string, unknown>[]) ?? [];
  const emails = await emailsByUserId(rows.map((r) => String(r.user_id)));

  return rows.map((r) =>
    readClaim(r, emails.get(String(r.user_id)) ?? null),
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
    .select("*, organisations(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getPendingChangeRequests: ${error.message}`);

  const rows = (data as Record<string, unknown>[]) ?? [];
  const emails = await emailsByUserId(rows.map((r) => String(r.user_id)));

  return rows.map((r) => ({
    ...readChangeRequest(r),
    organisationName: (embedded(r.organisations)?.name as string | null) ?? undefined,
    userEmail: emails.get(String(r.user_id)) ?? undefined,
  }));
}
