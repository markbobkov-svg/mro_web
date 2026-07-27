import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Our own Europe basemap (z0-13, extracted from Protomaps' OpenStreetMap build)
// hosted on Cloudflare R2. We proxy it through this same-origin route instead of
// letting the browser read the r2.dev URL directly: that keeps us off r2.dev's
// public rate limits and needs no CORS on the bucket. The server-to-server fetch
// re-serves the byte ranges same-origin. The object is public, so no creds here.
const SOURCE =
  "https://pub-8dfd157e131f4ce29bfa353f4c095e5a.r2.dev/europe-z13.pmtiles";

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
