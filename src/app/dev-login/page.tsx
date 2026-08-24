import DevLoginPanel from "./DevLoginPanel";

/**
 * TEMPORARY — the test-account switcher as its own route, so it stays reachable
 * while signed in (that is how you switch accounts without signing out first).
 * Delete this folder to remove it; see src/app/page.tsx for the other half.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dev sign-in — ONE4FIVE",
  robots: { index: false, follow: false },
};

export default function DevLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return <DevLoginPanel error={searchParams.error} />;
}
