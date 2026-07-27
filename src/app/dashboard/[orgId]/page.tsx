import Link from "next/link";
import { notFound } from "next/navigation";

import { getDashboardOrg } from "@/lib/dashboard";
import { ForbiddenError, requireMember, requireUser } from "@/lib/guards";
import { Alert } from "@/components/ui/Form";
import { ProfileForm } from "./ProfileForm";
import { ContactsEditor } from "./ContactsEditor";
import { RegulatorySections } from "./RegulatorySections";
import { ChangeRequestList } from "./ChangeRequestList";

export const dynamic = "force-dynamic";

export default async function OrganisationDashboard({
  params,
  searchParams,
}: {
  params: { orgId: string };
  searchParams: { claimed?: string };
}) {
  const user = await requireUser(`/dashboard/${params.orgId}`);

  try {
    await requireMember(user, params.orgId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <div className="space-y-4">
          <Alert kind="error">{err.message}</Alert>
          <Link href="/dashboard" className="text-sm text-accent hover:text-accent-bright">
            ← Back to your organisations
          </Link>
        </div>
      );
    }
    throw err;
  }

  const org = await getDashboardOrg(params.orgId);
  if (!org) notFound();

  const pendingCount = org.changeRequests.filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-xs text-white/35 transition hover:text-white/70"
        >
          ← Your organisations
        </Link>
        <h1 className="mt-2 text-lg font-normal tracking-wide2 text-white">{org.name}</h1>
        {org.legalName && org.legalName !== org.name ? (
          <p className="text-sm text-white/35">{org.legalName}</p>
        ) : null}
      </div>

      {searchParams.claimed === "1" ? (
        <Alert kind="notice">
          Verified by e-mail domain — this organisation is yours to edit.
        </Alert>
      ) : null}

      <nav className="flex flex-wrap gap-2 text-xs">
        {[
          ["#profile", "Profile"],
          ["#contacts", "Contacts"],
          ["#approvals", "Approvals"],
          ["#scope", "Scope"],
          ["#stations", "Stations"],
          ["#requests", pendingCount > 0 ? `Requests (${pendingCount})` : "Requests"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-[2px] border border-white/10 px-3 py-1.5 text-white/45
              transition hover:border-white/10 hover:text-white"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="profile" className="scroll-mt-20">
        <SectionHeading
          title="Profile"
          note="Published immediately. Empty fields fall back to what we scraped."
        />
        <ProfileForm org={org} />
      </section>

      <section id="contacts" className="scroll-mt-20">
        <SectionHeading
          title="Contacts"
          note="Published immediately. Once you add one, your contacts replace the scraped ones on the public card."
        />
        <ContactsEditor org={org} />
      </section>

      <RegulatorySections org={org} />

      <section id="requests" className="scroll-mt-20">
        <SectionHeading
          title="Change requests"
          note="Approvals, scope and stations come from the authorities' registers, so changes are checked before they go live."
        />
        <ChangeRequestList org={org} />
      </section>
    </div>
  );
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-medium text-white">{title}</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-white/35">{note}</p>
    </div>
  );
}
