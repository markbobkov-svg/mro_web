import Link from "next/link";

import { requireUser } from "@/lib/guards";
import { signOutAction } from "../(account)/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser("/admin");

  return (
    <div className="h-viewport overflow-y-auto scroll-thin bg-base-900">
      <header className="sticky top-0 z-10 border-b border-base-600 bg-base-900/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-5 py-3">
          <Link href="/" className="text-sm font-semibold tracking-brand text-white">
            ONE4FIVE
          </Link>
          <Link
            href="/dashboard"
            className="text-xs uppercase tracking-wide2 text-neutral-400 transition hover:text-white"
          >
            Dashboard
          </Link>
          <span className="text-xs uppercase tracking-wide2 text-accent">
            Review queue
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-neutral-500 sm:inline">
              {user.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-base-500 px-3 py-1.5 text-xs
                  text-neutral-300 transition hover:border-neutral-500 hover:text-white"
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
