import Link from "next/link";

import { getUserClaims } from "@/lib/dashboard";
import { getMemberships, requireUser } from "@/lib/guards";
import { Alert } from "@/components/ui/Form";

export const metadata = { title: "Dashboard — ONE4FIVE" };
export const dynamic = "force-dynamic";

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: { submitted?: string };
}) {
  const user = await requireUser();
  const [memberships, claims] = await Promise.all([
    getMemberships(user.id),
    getUserClaims(user.id),
  ]);

  const pending = claims.filter((c) => c.status === "pending");
  const rejected = claims.filter((c) => c.status === "rejected");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-normal tracking-wide2 text-white">
            {user.fullName ? `Hello, ${user.fullName}` : "Your organisations"}
          </h1>
          <p className="mt-1 text-sm text-white/45">
            Keep your listing on the map accurate.
          </p>
        </div>
        <Link
          href="/dashboard/claim"
          className="rounded-[2px] border border-accent/40 bg-accent/15 px-4 py-2 text-[11px]
            uppercase tracking-wide2 text-accent-bright transition hover:bg-accent/25"
        >
          Claim an organisation
        </Link>
      </div>

      {searchParams.submitted === "1" ? (
        <Alert kind="notice">
          Request received. We review claims by hand when the e-mail domain
          doesn&rsquo;t match — you will get access as soon as it is approved.
        </Alert>
      ) : null}

      {!user.emailConfirmed ? (
        <Alert kind="error">
          Your e-mail is not confirmed yet. Confirm it before claiming an
          organisation — the confirmation is what proves the address is yours.
        </Alert>
      ) : null}

      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-wide2 text-white/35">
          Organisations you manage
        </h2>

        {memberships.length === 0 ? (
          <div className="rounded-[2px] border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm text-white/45">
              You don&rsquo;t manage any organisation yet.
            </p>
            <Link
              href="/dashboard/claim"
              className="mt-3 inline-block text-sm text-accent transition hover:text-accent-bright"
            >
              Find yours and claim it →
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {memberships.map((m) => (
              <li key={m.organisationId}>
                <Link
                  href={`/dashboard/${m.organisationId}`}
                  className="block rounded-[2px] border border-white/10 bg-[#141414]/60 p-4 transition
                    hover:border-white/10 hover:bg-white/5"
                >
                  <span className="block text-sm font-medium text-white">
                    {m.organisationName}
                  </span>
                  <span className="mt-1 block text-xs uppercase tracking-wide2 text-white/35">
                    {m.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pending.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[10px] uppercase tracking-wide2 text-white/35">
            Awaiting review
          </h2>
          <ul className="space-y-2">
            {pending.map((c) => (
              <li
                key={c.id}
                className="rounded-[2px] border border-white/10 bg-[#141414]/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-white/85">
                    {c.organisationName ?? c.proposedName}
                    {c.kind === "new" ? (
                      <span className="ml-2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide2 text-white/45">
                        new organisation
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-white/35">
                    submitted {formatDate(c.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rejected.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[10px] uppercase tracking-wide2 text-white/35">
            Not approved
          </h2>
          <ul className="space-y-2">
            {rejected.map((c) => (
              <li
                key={c.id}
                className="rounded-[2px] border border-white/10 bg-[#141414]/60 px-4 py-3"
              >
                <span className="text-sm text-white/70">
                  {c.organisationName ?? c.proposedName}
                </span>
                {c.reviewNote ? (
                  <p className="mt-1 text-xs text-white/35">{c.reviewNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
