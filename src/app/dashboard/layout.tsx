import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser, resolveHomePath } from "@/lib/guards";
import { signOutAction } from "../(account)/actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // The MRO dashboard is for claiming and maintaining an organisation's listing.
  // An airline account has no listing to claim — its home is /airline, which has
  // no claim step — so send it there rather than show it the MRO claim UI.
  // resolveHomePath returns "/airline" only for airline-side accounts with no
  // organisation membership; org members and admins fall through to /dashboard.
  if ((await resolveHomePath(user.id)) === "/airline") {
    redirect("/airline");
  }

  return (
    <div className="relative h-viewport overflow-hidden bg-black">
      {/* The scrolling layer sits inside a non-scrolling box so the top/bottom
          fades below can pin to the viewport and never scroll with the content
          — the same split the landing uses for its scrims. */}
      <div className="absolute inset-0 overflow-y-auto scroll-thin">
        <header
          data-app-header
          className="sticky top-0 z-10 border-b border-white/10 bg-black/70 backdrop-blur-xl"
        >
          <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-5 py-3">
            <Link href="/" className="text-sm font-normal tracking-brand text-white">
              ONE<span className="text-accent-bright">4</span>FIVE
            </Link>
            <Link
              href="/dashboard"
              className="text-xs uppercase tracking-wide2 text-white/45 transition hover:text-white"
            >
              Dashboard
            </Link>
            {user.isAdmin ? (
              <Link
                href="/admin"
                className="text-xs uppercase tracking-wide2 text-accent transition hover:text-accent-bright"
              >
                Review queue
              </Link>
            ) : null}

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs text-white/35 sm:inline">
                {user.email}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-[2px] border border-white/10 px-3 py-1.5 text-[10px]
                    uppercase tracking-wide2 text-white/45 transition hover:bg-white/10 hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-5 py-8">{children}</main>
      </div>

      {/* Top/bottom dark fades over the scrolling content, like the landing's
          scrims. Shown only inside the map's dashboard drawer (.dash-scrim →
          html.embedded), where no header sits over this area, so they fall flush
          at the edges. pointer-events-none so they never block the UI. */}
      <div
        aria-hidden
        className="dash-scrim pointer-events-none absolute inset-x-0 top-0 z-20 h-16 bg-gradient-to-b from-black to-transparent"
      />
      <div
        aria-hidden
        className="dash-scrim pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-black to-transparent"
      />
    </div>
  );
}
