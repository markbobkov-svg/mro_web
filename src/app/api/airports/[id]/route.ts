import { NextResponse } from "next/server";
import { getAirportDetail } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const detail = await getAirportDetail(params.id);
    // A short shared cache is fine for read bursts, but 5 minutes was too long
    // now that an organisation editing its own card expects to see the change
    // straight away. Keep a brief CDN window and let browsers revalidate.
    return NextResponse.json(detail, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=15" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
