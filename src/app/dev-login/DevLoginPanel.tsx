import Link from "next/link";

import { Alert, Panel, SubmitButton } from "@/components/ui/Form";
import { getCurrentUser } from "@/lib/session";
import { DEV_ACCOUNTS } from "./accounts";
import { devSignInAction, devSignOutAction } from "./actions";

/**
 * TEMPORARY — one-click switching between the TESTING.md accounts, no passwords.
 *
 * Rendered both at `/dev-login` and, while this is in place, at `/` for a
 * signed-out visitor instead of the landing (see src/app/page.tsx). Signing in
 * writes the same httpOnly-cookie session a password sign-in writes, so the
 * dashboard, the map scoping and every guard behave exactly as they would in
 * real life — only the front door is different.
 */
export default async function DevLoginPanel({ error }: { error?: string }) {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen w-full bg-black px-5 py-10 text-white">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium tracking-wide2">ONE4FIVE</span>
            <span className="rounded-[2px] border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide2 text-red-300">
              Temporary test page
            </span>
          </div>
          <h1 className="text-lg text-white/90">Sign in as a test account</h1>
          <p className="text-sm leading-relaxed text-white/45">
            The accounts from <code className="text-white/60">TESTING.md</code>,
            one click each — no passwords. Every session is a real one, so the
            dashboards, the review queue and the map&rsquo;s per-account scoping
            behave exactly as they do for a normal sign-in.
          </p>
        </header>

        <Alert kind="error">
          Anyone who opens this page can sign in as any of these accounts, the
          administrator included. Delete{" "}
          <code>src/app/dev-login/</code> and put the landing back in{" "}
          <code>src/app/page.tsx</code> before the site is shown to anyone.
        </Alert>

        {error ? <Alert kind="error">{error}</Alert> : null}

        {user ? (
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-xs text-white/50">
              Signed in as{" "}
              <span className="font-mono text-white/80">{user.email}</span>
              {user.isAdmin ? (
                <span className="ml-2 text-[10px] uppercase tracking-wide2 text-accent-bright">
                  admin
                </span>
              ) : null}
            </p>
            <div className="flex gap-2">
              <Link
                href="/"
                className="inline-flex items-center rounded-[2px] border border-white/10 px-4 py-2 text-[11px] uppercase tracking-wide2 text-white/50 transition hover:bg-white/10 hover:text-white"
              >
                Map
              </Link>
              <form action={devSignOutAction}>
                <SubmitButton variant="ghost" pendingLabel="Signing out…">
                  Sign out
                </SubmitButton>
              </form>
            </div>
          </Panel>
        ) : null}

        <div className="space-y-3">
          {DEV_ACCOUNTS.map((account) => {
            const current = user?.email === account.email;
            return (
              <Panel
                key={account.email}
                className={`p-4 sm:p-5 ${current ? "border-accent/40" : ""}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-sm text-white/90">{account.name}</h2>
                  {current ? (
                    <span className="text-[10px] uppercase tracking-wide2 text-accent-bright">
                      current
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 font-mono text-xs text-white/45">
                  {account.email}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-white/40">
                  {account.exercises}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {account.targets.map((target, i) => (
                    <form key={target.path} action={devSignInAction}>
                      <input type="hidden" name="email" value={account.email} />
                      <input type="hidden" name="dest" value={target.path} />
                      <SubmitButton
                        variant={i === 0 ? "primary" : "ghost"}
                        pendingLabel="Signing in…"
                      >
                        {target.label}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </Panel>
            );
          })}
        </div>

        <p className="text-xs leading-relaxed text-white/30">
          Reach this page any time at{" "}
          <code className="text-white/50">/dev-login</code> — including while
          signed in, which is how you switch without signing out first. The real
          front door still works: <Link href="/login" className="text-white/60 underline-offset-2 hover:underline">/login</Link>{" "}
          with the passwords in TESTING.md,{" "}
          <Link href="/signup" className="text-white/60 underline-offset-2 hover:underline">/signup</Link>{" "}
          and{" "}
          <Link href="/airline/register" className="text-white/60 underline-offset-2 hover:underline">/airline/register</Link>{" "}
          for the registration flows.
        </p>
      </div>
    </main>
  );
}
