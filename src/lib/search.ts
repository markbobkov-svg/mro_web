import "server-only";

import { getSupabase } from "./supabase";
import type { SearchHit } from "./types";

/**
 * Free-text search over airports, the organisations stationed at them and the
 * scope those organisations are certified for.
 *
 * The whole searchable corpus is small (a few hundred airports, ~1.2k
 * organisations, ~9k scope rows), so it is loaded once and kept in memory:
 * every keystroke is then answered without touching the database, and none of
 * the scope text — megabytes of it — has to be shipped to the browser.
 */

const PAGE = 1000;
/** Rebuild the index at most this often (the scraper updates the DB rarely). */
const TTL_MS = 10 * 60 * 1000;

interface AirportDoc {
  id: string;
  iata: string | null;
  icao: string | null;
  name: string;
  city: string | null;
  countryCode: string | null;
  /** Lowercased airport-only text: name, city, codes, country. */
  own: string;
  orgIds: string[];
}

interface OrgDoc {
  id: string;
  name: string;
  /** Lowercased name + legal name. */
  nameText: string;
  /** Distinct scope lines, original case (shown in results). */
  scope: string[];
  /** Lowercased scope + class labels, joined — searched, never displayed raw. */
  scopeText: string;
}

interface Index {
  airports: AirportDoc[];
  orgs: Map<string, OrgDoc>;
  builtAt: number;
}

let indexPromise: Promise<Index> | null = null;
let indexBuiltAt = 0;

/** Read every row of a table in pages (PostgREST caps a response at 1000). */
async function readAll(
  supabase: any,
  table: string,
  columns: string,
): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`search index (${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function buildIndex(): Promise<Index> {
  const supabase = getSupabase();

  const [airportRows, stationRows, orgRows, scopeRows] = await Promise.all([
    readAll(supabase, "airports", "id, iata_code, icao_code, name, city, country_code"),
    readAll(supabase, "organisation_stations", "airport_id, organisation_id"),
    readAll(supabase, "organisations", "id, name, legal_name"),
    readAll(
      supabase,
      "organisation_scope",
      "organisation_id, scope_text, scope_text_en, rating_class_text, rating_class_text_en",
    ),
  ]);

  // organisations
  const orgs = new Map<string, OrgDoc>();
  for (const o of orgRows) {
    orgs.set(o.id, {
      id: o.id,
      name: o.name ?? "Unknown organisation",
      nameText: `${o.name ?? ""} ${o.legal_name ?? ""}`.toLowerCase(),
      scope: [],
      scopeText: "",
    });
  }

  // scope per organisation (deduplicated, case-insensitively)
  const seenScope = new Map<string, Set<string>>();
  const scopeParts = new Map<string, string[]>();
  for (const s of scopeRows) {
    const org = orgs.get(s.organisation_id);
    if (!org) continue;
    const text = (s.scope_text_en || s.scope_text || "").trim();
    const cls = (s.rating_class_text_en || s.rating_class_text || "").trim();
    if (text) {
      let seen = seenScope.get(s.organisation_id);
      if (!seen) {
        seen = new Set();
        seenScope.set(s.organisation_id, seen);
      }
      const key = text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        org.scope.push(text);
      }
    }
    const parts = scopeParts.get(s.organisation_id) ?? [];
    if (text) parts.push(text);
    if (cls) parts.push(cls);
    scopeParts.set(s.organisation_id, parts);
  }
  for (const [orgId, parts] of scopeParts) {
    const org = orgs.get(orgId);
    if (org) org.scopeText = parts.join(" | ").toLowerCase();
  }

  // airports + the organisations stationed at each
  const orgIdsByAirport = new Map<string, Set<string>>();
  for (const st of stationRows) {
    if (!st.airport_id || !st.organisation_id) continue;
    let set = orgIdsByAirport.get(st.airport_id);
    if (!set) {
      set = new Set();
      orgIdsByAirport.set(st.airport_id, set);
    }
    set.add(st.organisation_id);
  }

  const airports: AirportDoc[] = [];
  for (const a of airportRows) {
    const orgIds = Array.from(orgIdsByAirport.get(a.id) ?? []);
    if (orgIds.length === 0) continue; // nothing to find here
    airports.push({
      id: a.id,
      iata: a.iata_code ?? null,
      icao: a.icao_code ?? null,
      name: a.name ?? "Airport",
      city: a.city ?? null,
      countryCode: a.country_code ?? null,
      own: [a.name, a.city, a.iata_code, a.icao_code, a.country_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      orgIds,
    });
  }

  return { airports, orgs, builtAt: Date.now() };
}

function getIndex(): Promise<Index> {
  const stale = Date.now() - indexBuiltAt > TTL_MS;
  if (!indexPromise || stale) {
    indexBuiltAt = Date.now();
    indexPromise = buildIndex().catch((err) => {
      // let the next request retry instead of caching the failure
      indexPromise = null;
      indexBuiltAt = 0;
      throw err;
    });
  }
  return indexPromise;
}

/**
 * The query works as a filter, not just a lookup.
 *
 * Tokens that the airport itself satisfies (its name, city or code) select the
 * airport; the remaining tokens must all be satisfied by one and the same
 * organisation there. So "737 TLL" returns Tallinn with only the organisations
 * that hold a 737 rating — not everything based at TLL — and "737 cfm56" wants
 * a single organisation covering both.
 */
export async function searchAirports(
  query: string,
  limit = 12,
): Promise<SearchHit[]> {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const { airports, orgs } = await getIndex();

  const orgMatches = (id: string, t: string) => {
    const org = orgs.get(id);
    return !!org && (org.nameText.includes(t) || org.scopeText.includes(t));
  };

  const hits: { doc: AirportDoc; score: number; matchedOrgIds: string[] }[] = [];
  for (const doc of airports) {
    const airportTokens = tokens.filter((t) => doc.own.includes(t));
    const orgTokens = tokens.filter((t) => !doc.own.includes(t));

    // organisations here that satisfy every token the airport didn't
    const matchedOrgIds =
      orgTokens.length === 0
        ? doc.orgIds
        : doc.orgIds.filter((id) => orgTokens.every((t) => orgMatches(id, t)));
    if (matchedOrgIds.length === 0) continue;

    let score = airportTokens.length * 10;
    for (const t of airportTokens) {
      // an exact code match is the strongest signal
      if (doc.iata?.toLowerCase() === t || doc.icao?.toLowerCase() === t) {
        score += 100;
      }
    }
    hits.push({ doc, score, matchedOrgIds });
  }

  hits.sort(
    (a, b) => b.score - a.score || b.matchedOrgIds.length - a.matchedOrgIds.length,
  );

  return hits.slice(0, limit).map(({ doc, matchedOrgIds }) => {
    const orgTokens = tokens.filter((t) => !doc.own.includes(t));
    const matchedOrgs: string[] = [];
    const matchedScope: string[] = [];
    for (const id of matchedOrgIds) {
      const org = orgs.get(id);
      if (!org) continue;
      if (
        matchedOrgs.length < 3 &&
        orgTokens.some((t) => org.nameText.includes(t))
      ) {
        matchedOrgs.push(org.name);
      }
      if (matchedScope.length < 3) {
        for (const line of org.scope) {
          const low = line.toLowerCase();
          if (orgTokens.some((t) => low.includes(t))) {
            if (!matchedScope.includes(line)) matchedScope.push(line);
            if (matchedScope.length >= 3) break;
          }
        }
      }
    }
    return {
      id: doc.id,
      iata: doc.iata,
      icao: doc.icao,
      name: doc.name,
      city: doc.city,
      countryCode: doc.countryCode,
      orgCount: matchedOrgIds.length,
      totalOrgCount: doc.orgIds.length,
      matchedOrgIds: orgTokens.length === 0 ? [] : matchedOrgIds,
      matchedOrgs,
      matchedScope,
    };
  });
}
