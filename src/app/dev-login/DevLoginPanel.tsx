import { Alert, SubmitButton } from "@/components/ui/Form";
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
    <main className="flex min-h-screen w-full items-center justify-center bg-black px-5 py-10 text-white">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium tracking-wide2">ONE4FIVE</span>
          <span className="text-[10px] uppercase tracking-wide2 text-red-300/70">
            Test sign-in
          </span>
        </div>

        {error ? <Alert kind="error">{error}</Alert> : null}

        <div className="space-y-2">
          {DEV_ACCOUNTS.map((account) => (
            <form key={account.email} action={devSignInAction}>
              <input type="hidden" name="email" value={account.email} />
              <input type="hidden" name="dest" value="/" />
              <SubmitButton
                variant={user?.email === account.email ? "primary" : "ghost"}
                pendingLabel="Signing in…"
                className="w-full justify-between normal-case"
              >
                {/* tracking on the spans, not the button: the button's own
                    tracking-wide2 would win the tie there and letter-space
                    these labels like the uppercase ones. */}
                <span className="text-xs tracking-normal text-white/85">
                  {account.name}
                </span>
                <span className="font-mono text-[10px] tracking-normal text-white/30">
                  {account.email}
                </span>
              </SubmitButton>
            </form>
          ))}
        </div>

        {user ? (
          <form action={devSignOutAction} className="flex justify-center">
            <SubmitButton variant="ghost" pendingLabel="Signing out…">
              Sign out
            </SubmitButton>
          </form>
        ) : null}

        <p className="text-center text-[10px] leading-relaxed text-white/25">
          Anyone who opens this page can sign in as any of these, administrator
          included. Delete <code>src/app/dev-login/</code> before launch.
        </p>
      </div>
    </main>
  );
}
