import { NextResponse } from "next/server";

import { searchOrganisations } from "@/lib/dashboard";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Type-ahead for the claim page. Signed-in users only. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await searchOrganisations(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
