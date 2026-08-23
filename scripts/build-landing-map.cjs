/**
 * Regenerate the landing backdrop image: public/landing-map.jpg
 *
 * The signed-out landing shows a *static* picture of the map (dark Europe with
 * the airport dot positions baked in) instead of mounting the live MapLibre map
 * — see src/components/MapBackdrop.tsx. This script rebuilds that picture. Run
 * it when the set of airports with Part-145 organisations shifts enough to be
 * worth refreshing (it's otherwise stable — the framing and dots rarely move).
 *
 * It does the deterministic half: pull the marker coordinates from Supabase,
 * download the CARTO dark (no-labels) tiles for the map's own view
 * (centre 10,50 / zoom 4), and emit an HTML tile-grid with the dots on top.
 * Then screenshot that HTML to the JPEG — the capture needs a headless browser,
 * so it's a separate command:
 *
 *   1. node scripts/build-landing-map.cjs
 *        → writes <workdir>/build.html and prints its path + the {W,H} size.
 *   2. Open build.html in a headless Chromium at exactly WxH (no device-scale)
 *      and screenshot the viewport as JPEG (quality ~82) to public/landing-map.jpg.
 *      Any headless-screenshot tool works; the page is fully local (file://),
 *      so no network or WebGL is involved in the capture.
 *
 * Requires SUPABASE_URL / SUPABASE_KEY in .env.local, curl on PATH, and (for
 * the tile download in a sandboxed network) the usual https_proxy env — curl
 * inherits it; pass --cacert if the proxy uses its own CA.
 *
 * Attribution: the tiles are CARTO's dark basemap of OpenStreetMap data, so the
 * landing credits "© OpenStreetMap contributors, rendered by CARTO".
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.OUT_DIR || path.join(os.tmpdir(), "landing-map-build");
const TILES = path.join(OUT, "tiles");
const CACERT = process.env.CURL_CACERT || ""; // e.g. the agent proxy CA bundle
fs.mkdirSync(TILES, { recursive: true });

// env
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = require(path.join(ROOT, "node_modules/@supabase/supabase-js"));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, { auth: { persistSession: false } });

// framing — must match VectorBasemap's backdrop view (see src/lib/basemap.ts)
const CENTER = [10, 50];
const Z = 5; // matches the main map: COVERAGE_BBOX (~Europe) fills the frame
const W = 1920, H = 1200, TSIZE = 256;
const world = TSIZE * Math.pow(2, Z);
const lngToX = (lng) => ((lng + 180) / 360) * world;
const latToY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * world;
};

(async () => {
  // marker airports = airports referenced by an organisation_station (same set
  // as getAirportMarkers in src/lib/data.ts), with resolvable coordinates.
  const ids = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("organisation_stations").select("airport_id")
      .not("airport_id", "is", null).range(from, from + 999);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const r of data) if (r.airport_id) ids.add(r.airport_id);
    if (data.length < 1000) break;
  }
  const dots = [];
  const arr = [...ids];
  for (let i = 0; i < arr.length; i += 200) {
    const { data, error } = await sb
      .from("airports").select("latitude, longitude").in("id", arr.slice(i, i + 200));
    if (error) throw error;
    for (const a of data || []) {
      if (a.latitude != null && a.longitude != null) dots.push([Number(a.longitude), Number(a.latitude)]);
    }
  }
  console.log("dots:", dots.length);

  const cx = lngToX(CENTER[0]), cy = latToY(CENTER[1]);
  const left = cx - W / 2, top = cy - H / 2;
  const tx0 = Math.floor(left / TSIZE), tx1 = Math.floor((left + W) / TSIZE);
  const ty0 = Math.floor(top / TSIZE), ty1 = Math.floor((top + H) / TSIZE);
  const max = Math.pow(2, Z);
  const imgs = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (tx < 0 || ty < 0 || tx >= max || ty >= max) continue;
      const file = path.join(TILES, `${Z}_${tx}_${ty}.png`);
      const url = `https://a.basemaps.cartocdn.com/dark_nolabels/${Z}/${tx}/${ty}@2x.png`;
      if (!fs.existsSync(file)) {
        execSync(`curl -sS ${CACERT ? `--cacert "${CACERT}"` : ""} -o "${file}" "${url}"`, { stdio: "pipe" });
      }
      imgs.push({ x: Math.round(tx * TSIZE - left), y: Math.round(ty * TSIZE - top), file });
    }
  }
  console.log("tiles:", imgs.length);

  const tileEls = imgs
    .map((t) => `<img src="file://${t.file}" style="position:absolute;left:${t.x}px;top:${t.y}px;width:${TSIZE}px;height:${TSIZE}px"/>`)
    .join("");
  const dotEls = dots
    .map(([lng, lat]) => {
      const x = lngToX(lng) - left, y = latToY(lat) - top;
      if (x < -8 || y < -8 || x > W + 8 || y > H + 8) return "";
      return `<div class="dot" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"></div>`;
    })
    .filter(Boolean).join("");
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#0a0d13}
    #stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#0a0d13}
    .dot{position:absolute;width:5px;height:5px;margin:-2.5px 0 0 -2.5px;border-radius:50%;
      background:#e6eeff;box-shadow:0 0 5px 1.5px rgba(150,180,255,.75),0 0 2px 1px rgba(255,255,255,.7)}
  </style><div id="stage">${tileEls}${dotEls}</div>`;
  const htmlPath = path.join(OUT, "build.html");
  fs.writeFileSync(htmlPath, html);
  console.log(`\nWROTE ${htmlPath}`);
  console.log(`Now screenshot it at ${W}x${H} (deviceScaleFactor 1) → ${path.join(ROOT, "public/landing-map.jpg")}`);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
