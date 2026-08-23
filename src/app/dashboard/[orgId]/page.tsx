import Link from "next/link";
import { notFound } from "next/navigation";

import { getDashboardOrg } from "@/lib/dashboard";
import { ForbiddenError, requireMember, requireUser } from "@/lib/guards";
import { Alert } from "@/components/ui/Form";
import { DashboardTabs } from "./DashboardTabs";

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
            ← Back to your dashboard
          </Link>
        </div>
      );
    }
    throw err;
  }

  const org = await getDashboardOrg(params.orgId);
  if (!org) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-normal tracking-wide2 text-white">{org.name}</h1>
        {org.legalName && org.legalName !== org.name ? (
          <p className="text-sm text-white/35">{org.legalName}</p>
        ) : null}
      </div>

      {searchParams.claimed === "1" ? (
        <Alert kind="notice">
          Verified by e-mail domain — this organisation is yours to edit.
        </Alert>
      ) : null}

      <DashboardTabs org={org} />
    </div>
  );
}
