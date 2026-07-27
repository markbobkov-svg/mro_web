import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Protomaps' demo PMTiles only sends CORS headers for protomaps.com, so the
// browser can't read it cross-origin from our domain. Proxy it through our own
// server (server-to-server fetch isn't subject to CORS) and re-serve the byte
// ranges same-origin. NOTE: this uses Protomaps' public demo bucket — fine for
// now; for production launch, self-host the PMTiles (e.g. on R2/S3) or use a
// paid Protomaps plan, then point pmtiles:// straight at it.
const SOURCE = "https://demo-bucket.protomaps.com/v4.pmtiles";

export async function GET(req: Request) {
  // pmtiles always uses ranged reads; guard against fetching the whole file.
  const range = req.headers.get("range") ?? "bytes=0-16383";
  let upstream: Response;
  try {
    upstream = await fetch(SOURCE, { headers: { range }, cache: "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const body = await upstream.arrayBuffer();
  const headers = new Headers();
  headers.set("content-type", "application/octet-stream");
  headers.set("accept-ranges", "bytes");
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("content-range", cr);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  // range responses are immutable — let the CDN/browser cache them hard
  headers.set("cache-control", "public, max-age=86400, s-maxage=604800, immutable");
  headers.set("access-control-allow-origin", "*");

  return new Response(body, { status: upstream.status, headers });
}
