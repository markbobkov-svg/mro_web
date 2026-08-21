import Link from "next/link";

import {
  activateAirlineMemberships,
  getAirline,
  getUserAirlineRegistrations,
  type AirlineRegistrationRow,
} from "@/lib/airlines";
import { getAirlineMemberships, requireUser } from "@/lib/guards";
import { websiteDomain } from "@/lib/domains";
import { Alert } from "@/components/ui/Form";
import type { CurrentUser } from "@/lib/session";
import { signOutAction } from "../(account)/actions";
import { AccountForm } from "./AccountForm";

export const metadata = { title: "Airline dashboard — ONE4FIVE" };
export const dynamic = "force-dynamic";

/**
 * The airline dashboard has no claim step.
 *
 * Unlike an MRO — which claims a listing that already exists on the map — an
 * airline is verified once, at registration (`/airline/register`): the person
 * picks their airline and we auto-approve when their work-e-mail domain matches
 * the airline's website, else queue it for an admin. So the dashboard is never a
 * place to "connect an airline"; it only reflects where that one decision landed
 * — you manage your airline, you're waiting on review, or you were turned down.
 */
export default async function AirlineDashboard() {
  const user = await requireUser("/airline");

  // Registration happens before confirmation; this promotes any auto-approved
  // registration to a real membership now that the account is confirmed.
  await activateAirlineMemberships(user.id, user.emailConfirmed);

  const [memberships, registrations] = await Promise.all([
    getAirlineMemberships(user.id),
    getUserAirlineRegistrations(user.id),
  ]);

  const primary = memberships[0] ?? null;
  const airline = primary ? await getAirline(primary.airlineId) : null;

  const pending = registrations.filter((r) => r.status === "pending");
  const approved = registrations.filter((r) => r.status === "approved");
  const rejected = registrations.filter((r) => r.status === "rejected");

  return (
    <>
      <Header user={user} />
      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        {primary ? (
          <MemberView
            airlineName={airline?.name ?? primary.airlineName}
            website={airline?.website ?? null}
            countryCode={airline?.countryCode ?? null}
            otherCount={memberships.length - 1}
            user={user}
          />
        ) : !user.emailConfirmed && registrations.length > 0 ? (
          // Confirmation gates everything — nothing proceeds until the e-mail is
          // clicked, whether the registration auto-approved or is queued.
          <ConfirmEmailView
            email={user.email}
            names={regNames([...approved, ...pending, ...rejected])}
          />
        ) : pending.length > 0 || approved.length > 0 ? (
          <PendingView names={regNames([...pending, ...approved])} />
        ) : rejected.length > 0 ? (
          <RejectedView items={rejected} />
        ) : (
          <NotLinkedView email={user.email} />
        )}
      </main>
    </>
  );
}

function regNames(rows: AirlineRegistrationRow[]): string[] {
  const names = rows.map((r) => r.airlineName ?? r.proposedName ?? "your airline");
  return [...new Set(names)];
}

function Header({ user }: { user: CurrentUser }) {
  return (
    <header
      data-app-header
      className="sticky top-0 z-10 border-b border-white/10 bg-black/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-5 py-3">
        <Link href="/" className="text-sm font-normal tracking-brand text-white">
          ONE<span className="text-accent-bright">4</span>FIVE
        </Link>
        <span className="text-xs uppercase tracking-wide2 text-accent">Airline</span>
        {user.isAdmin ? (
          <Link
            href="/admin"
            className="text-xs uppercase tracking-wide2 text-white/45 transition hover:text-white"
          >
            Review queue
          </Link>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-white/35 sm:inline">{user.email}</span>
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
  );
}

function MemberView({
  airlineName,
  website,
  countryCode,
  otherCount,
  user,
}: {
  airlineName: string;
  website: string | null;
  countryCode: string | null;
  otherCount: number;
  user: CurrentUser;
}) {
  const host = websiteDomain(website);
  const href = website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-lg font-normal tracking-wide2 text-white">
          {user.fullName ? `Hello, ${user.fullName}` : "Your airline account"}
        </h1>
        <p className="mt-1 text-sm text-white/45">
          You&rsquo;re signed in for {airlineName}.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-wide2 text-white/35">
          Your airline
        </h2>
        <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
          <p className="text-sm font-medium text-white">{airlineName}</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {host ? (
              <div className="flex gap-2">
                <dt className="shrink-0 text-white/35">Website</dt>
                <dd className="min-w-0 truncate">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent transition hover:text-accent-bright"
                    >
                      {host}
                    </a>
                  ) : (
                    <span className="text-white/70">{host}</span>
                  )}
                </dd>
              </div>
            ) : null}
            {countryCode ? (
              <div className="flex gap-2">
                <dt className="shrink-0 text-white/35">Country</dt>
                <dd className="text-white/70">{countryCode}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-white/35">
            These details come from the public aviation registers. To correct
            them, drop us a line and we&rsquo;ll pass it to the data team.
          </p>
        </div>
        {otherCount > 0 ? (
          <p className="mt-2 text-xs text-white/35">
            + {otherCount} more airline{otherCount === 1 ? "" : "s"} on this account.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-[10px] uppercase tracking-wide2 text-white/35">
          Your details
        </h2>
        <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
          <AccountForm
            fullName={user.fullName ?? ""}
            jobTitle={user.jobTitle ?? ""}
            phone={user.phone ?? ""}
          />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-white/10 bg-[#141414]/60 p-5">
          <div>
            <p className="text-sm text-white/85">Find a Part-145 MRO</p>
            <p className="mt-1 text-xs text-white/45">
              Browse approved maintenance organisations across Europe.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-[2px] border border-accent/40 bg-accent/15 px-4 py-2 text-[11px]
              uppercase tracking-wide2 text-accent-bright transition hover:bg-accent/25"
          >
            Open the map
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * Auto-approved or queued, the account still can't open until the e-mail is
 * confirmed — so that is the only thing to say here.
 */
function ConfirmEmailView({ email, names }: { email: string; names: string[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-normal tracking-wide2 text-white">
          Almost there
        </h1>
        <p className="mt-1 text-sm text-white/45">One step left to open your account.</p>
      </div>
      <Alert kind="error">
        Confirm your e-mail to finish. We sent a link to{" "}
        <span className="text-white/85">{email}</span> — click it, then reload.
        {names.length > 0 ? (
          <>
            {" "}
            That confirmation is what opens your dashboard for{" "}
            <strong>{names.join(", ")}</strong>.
          </>
        ) : (
          <> That confirmation is what opens your dashboard.</>
        )}
      </Alert>
      <BackToMap />
    </div>
  );
}

function PendingView({ names }: { names: string[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-normal tracking-wide2 text-white">
          Registration received
        </h1>
        <p className="mt-1 text-sm text-white/45">
          Nothing more to do — we&rsquo;ll take it from here.
        </p>
      </div>
      <Alert kind="notice">
        Your registration for <strong>{names.join(", ")}</strong> is being
        processed. When the e-mail domain doesn&rsquo;t match the airline&rsquo;s
        website we review it by hand — you&rsquo;ll get access here as soon as
        it&rsquo;s approved.
      </Alert>
      <BackToMap />
    </div>
  );
}

/**
 * A turned-down registration. Purely informational: the reviewer's reason, and
 * how verification works — there is no in-dashboard retry to file, because a
 * fresh registration from a matching work e-mail is the way back in.
 */
function RejectedView({ items }: { items: AirlineRegistrationRow[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-normal tracking-wide2 text-white">
          Registration not approved
        </h1>
        <p className="mt-1 text-sm text-white/45">
          We couldn&rsquo;t confirm your link to the airline.
        </p>
      </div>

      <section className="space-y-2">
        {items.map((r) => (
          <div
            key={r.id}
            className="rounded-[2px] border border-white/10 bg-[#141414]/60 px-4 py-3"
          >
            <p className="text-sm text-white/70">
              {r.airlineName ?? r.proposedName ?? "Your airline"}
            </p>
            {r.reviewNote ? (
              <p className="mt-1 text-xs text-white/35">{r.reviewNote}</p>
            ) : null}
          </div>
        ))}
      </section>

      <Alert kind="info">
        We verify airlines from your work e-mail&rsquo;s domain. Registering from
        an address on the airline&rsquo;s own website domain is approved
        automatically; otherwise reply to our e-mail and we&rsquo;ll take another
        look.
      </Alert>

      <BackToMap />
    </div>
  );
}

/**
 * A signed-in account with no airline registration at all — reachable only by
 * an MRO or other account visiting `/airline` directly, since the airline flow
 * always leaves a registration behind. Just point them back out.
 */
function NotLinkedView({ email }: { email: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-normal tracking-wide2 text-white">
          No airline linked
        </h1>
        <p className="mt-1 text-sm text-white/45">
          Signed in as <span className="text-white/70">{email}</span>.
        </p>
      </div>
      <Alert kind="info">
        This account isn&rsquo;t registered to an airline. Airline accounts are
        created at registration, where we verify your work e-mail against the
        airline&rsquo;s website.
      </Alert>
      <BackToMap />
    </div>
  );
}

function BackToMap() {
  return (
    <Link
      href="/"
      className="inline-block text-sm text-accent transition hover:text-accent-bright"
    >
      ← Back to the map
    </Link>
  );
}
