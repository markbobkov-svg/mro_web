import Link from "next/link";

import { requireUser } from "@/lib/guards";
import { signOutAction } from "../(account)/actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="h-viewport overflow-y-auto scroll-thin bg-black">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/70 backdrop-blur-xl">
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
  );
}
