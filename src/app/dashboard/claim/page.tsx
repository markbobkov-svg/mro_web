import Link from "next/link";

import { requireUser } from "@/lib/guards";
import { Alert } from "@/components/ui/Form";
import { ClaimPanel } from "./ClaimPanel";

export const metadata = { title: "Claim an organisation — ONE4FIVE" };
export const dynamic = "force-dynamic";

export default async function ClaimPage() {
  const user = await requireUser("/dashboard/claim");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-white">
          Claim your organisation
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Signed in as <span className="text-neutral-300">{user.email}</span>.
        </p>
      </div>

      {!user.emailConfirmed ? (
        <Alert kind="error">
          Confirm your e-mail address first — until then we can&rsquo;t treat it
          as proof of anything.
        </Alert>
      ) : (
        <ClaimPanel userEmail={user.email} />
      )}
    </div>
  );
}
