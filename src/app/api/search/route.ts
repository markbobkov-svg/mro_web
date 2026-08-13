import { NextResponse } from "next/server";
import { searchAirports } from "@/lib/search";
import { hasValidSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // The map is behind a sign-in wall, so its data endpoints are too — otherwise
  // the wall is just the UI and anyone could script around it.
  if (!(await hasValidSession())) {
    return NextResponse.json(
      { error: "Sign in to search the map." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  try {
    const results = await searchAirports(q);
    // Private only: the response is behind auth, so a shared CDN must not hold a
    // copy it could serve to a signed-out request.
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
