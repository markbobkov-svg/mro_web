// Builds a compact coordinate lookup keyed by ICAO and IATA codes, sourced from
// the public-domain OurAirports dataset. Used server-side ONLY as a fallback
// when an airports row in Supabase has no latitude/longitude of its own, so the
// map can always place a marker. Re-run with `npm run coords` to refresh.
//
// Output: data/airport-coords.json  =>  { "EDDF": [8.5622, 50.0379], "FRA": [...] }
// Values are [longitude, latitude] (GeoJSON order).

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const KEEP_TYPES = new Set([
  "large_airport",
  "medium_airport",
  "small_airport",
  "seaplane_base",
]);

// Minimal CSV parser that handles quoted fields with embedded commas/quotes.
function parseCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

async function main() {
  console.log("Downloading OurAirports dataset…");
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const text = await res.text();

  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  const col = (name) => header.indexOf(name);
  const iType = col("type");
  const iLat = col("latitude_deg");
  const iLon = col("longitude_deg");
  const iIdent = col("ident");
  const iGps = col("gps_code");
  const iIata = col("iata_code");

  const coords = {};
  let kept = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const row = parseCsvLine(line);
    const type = row[iType];
    const iata = (row[iIata] || "").trim().toUpperCase();
    // keep proper airports, or anything that has an IATA code
    if (!KEEP_TYPES.has(type) && !iata) continue;

    const lat = parseFloat(row[iLat]);
    const lon = parseFloat(row[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const pair = [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];

    const ident = (row[iIdent] || "").trim().toUpperCase();
    const gps = (row[iGps] || "").trim().toUpperCase();

    if (ident) coords[ident] = pair;
    if (gps && !coords[gps]) coords[gps] = pair;
    if (iata) coords[iata] = pair;
    kept++;
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = join(__dirname, "..", "data", "airport-coords.json");
  await writeFile(outPath, JSON.stringify(coords));
  console.log(
    `Wrote ${Object.keys(coords).length} code entries (${kept} airports) -> ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
