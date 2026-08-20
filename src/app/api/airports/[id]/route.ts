import { NextResponse } from "next/server";
import { getAirportDetail } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { getViewerOrgScope } from "@/lib/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  // Behind the same sign-in wall as the map it feeds. We resolve the full user
  // (not just a valid session) so an MRO's card list can be scoped to its own
  // organisation — it must see only its own card, even here where the panel
  // fetches straight from the API rather than through the SSR'd page.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to view airport details." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const scope = await getViewerOrgScope(user);
    const detail = await getAirportDetail(params.id, scope);
    // Private, not shared: the response is behind auth, and an organisation
    // editing its own card still expects the change to show straight away.
    return NextResponse.json(detail, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
