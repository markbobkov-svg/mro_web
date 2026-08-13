import { NextResponse } from "next/server";

import { searchAirlines } from "@/lib/airlines";

export const dynamic = "force-dynamic";

/**
 * Type-ahead for the airline registration form.
 *
 * Open to anonymous callers on purpose: registration happens before the account
 * exists, and airline names/countries/websites are public register data (the
 * same rows the scraper pulls from the authorities). Kept cheap by the 2-char
 * minimum and the small result cap in searchAirlines.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await searchAirlines(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
