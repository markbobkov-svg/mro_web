import { NextResponse } from "next/server";
import { getAirportDetail } from "@/lib/data";
import { hasValidSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  // Behind the same sign-in wall as the map it feeds.
  if (!(await hasValidSession())) {
    return NextResponse.json(
      { error: "Sign in to view airport details." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const detail = await getAirportDetail(params.id);
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
