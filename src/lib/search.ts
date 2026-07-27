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
 * Every token of the query must match somewhere — the airport itself, an
 * organisation's name, or its certified scope — but the tokens may match in
 * different places. That makes multi-word queries like "boeing 737 amsterdam"
 * or "lufthansa engines" work, which a plain substring match cannot do.
 */
export async function searchAirports(
  query: string,
  limit = 12,
): Promise<SearchHit[]> {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const { airports, orgs } = await getIndex();

  // per token: which organisations match it (by name or by scope)
  const orgMatchPerToken = tokens.map((t) => {
    const set = new Set<string>();
    for (const org of orgs.values()) {
      if (org.nameText.includes(t) || org.scopeText.includes(t)) set.add(org.id);
    }
    return set;
  });

  const hits: { doc: AirportDoc; score: number }[] = [];
  for (const doc of airports) {
    let ok = true;
    let score = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const inAirport = doc.own.includes(t);
      // an organisation at this airport matching the token also counts
      const orgSet = orgMatchPerToken[i];
      const inOrg = !inAirport && doc.orgIds.some((id) => orgSet.has(id));
      if (!inAirport && !inOrg) {
        ok = false;
        break;
      }
      // airport-level matches rank above organisation-level ones
      if (inAirport) score += 10;
      // exact code match is the strongest signal
      if (doc.iata?.toLowerCase() === t || doc.icao?.toLowerCase() === t) {
        score += 100;
      }
    }
    if (ok) hits.push({ doc, score });
  }

  hits.sort(
    (a, b) => b.score - a.score || b.doc.orgIds.length - a.doc.orgIds.length,
  );

  return hits.slice(0, limit).map(({ doc }) => {
    const matchedOrgs: string[] = [];
    const matchedScope: string[] = [];
    for (const id of doc.orgIds) {
      const org = orgs.get(id);
      if (!org) continue;
      if (tokens.some((t) => org.nameText.includes(t))) {
        if (matchedOrgs.length < 3) matchedOrgs.push(org.name);
      }
      if (matchedScope.length < 3) {
        for (const line of org.scope) {
          const low = line.toLowerCase();
          if (tokens.some((t) => low.includes(t) && !doc.own.includes(t))) {
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
      orgCount: doc.orgIds.length,
      matchedOrgs,
      matchedScope,
    };
  });
}
