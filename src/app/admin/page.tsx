import Link from "next/link";

import { getPendingChangeRequests, getPendingClaims } from "@/lib/dashboard";
import { ForbiddenError, requireAdmin } from "@/lib/guards";
import { Alert } from "@/components/ui/Form";
import { ClaimReview } from "./ClaimReview";
import { ChangeReview } from "./ChangeReview";

export const metadata = { title: "Review queue — ONE4FIVE" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <div className="space-y-4">
          <Alert kind="error">{err.message}</Alert>
          <Link href="/dashboard" className="text-sm text-accent hover:text-accent-bright">
            ← Back to the dashboard
          </Link>
        </div>
      );
    }
    throw err;
  }

  const [claims, changes] = await Promise.all([
    getPendingClaims(),
    getPendingChangeRequests(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-white">Review queue</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {claims.length} claim{claims.length === 1 ? "" : "s"} and{" "}
          {changes.length} change request{changes.length === 1 ? "" : "s"}{" "}
          waiting.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-[11px] uppercase tracking-wide2 text-neutral-500">
          Account claims
        </h2>
        {claims.length === 0 ? (
          <p className="rounded-xl border border-dashed border-base-500 p-6 text-center text-sm text-neutral-500">
            Nothing to review.
          </p>
        ) : (
          <ul className="space-y-3">
            {claims.map((c) => (
              <li key={c.id}>
                <ClaimReview claim={c} currentAdminId={admin.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[11px] uppercase tracking-wide2 text-neutral-500">
          Proposed data changes
        </h2>
        {changes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-base-500 p-6 text-center text-sm text-neutral-500">
            Nothing to review.
          </p>
        ) : (
          <ul className="space-y-3">
            {changes.map((r) => (
              <li key={r.id}>
                <ChangeReview request={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
