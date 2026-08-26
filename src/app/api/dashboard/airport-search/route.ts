import { NextResponse } from "next/server";

import { searchAirports } from "@/lib/dashboard";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Type-ahead over the airports register for the Stations tab. Signed-in users
 * only — same wall as the rest of the dashboard.
 *
 * It returns register rows and nothing organisation-specific, so membership is
 * not checked here: the guard that matters is on the write, where
 * `saveStationAction` re-reads the posted airport id.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await searchAirports(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
