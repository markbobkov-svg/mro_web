/**
 * TEMPORARY — the test-account switcher's account list.
 *
 * The four accounts from TESTING.md. This list is also the *allowlist* the
 * sign-in action checks against: nothing outside it can ever be signed into
 * from this page, whatever is posted.
 *
 * Delete the whole `src/app/dev-login/` folder to remove the switcher — see the
 * note in src/app/page.tsx for the one edit that goes with it.
 */

export interface DevAccount {
  email: string;
  /** Who this is, in a couple of words. */
  name: string;
  /** What signing in as them exercises — the TESTING.md column. */
  exercises: string;
  /** Where the buttons go, in order. `/` is the map. */
  targets: { label: string; path: string }[];
}

export const DEV_ACCOUNTS: DevAccount[] = [
  {
    email: "manager@test-mro.example.com",
    name: "MRO manager",
    exercises:
      "Domain matches the organisation's website, so a claim on Demo MRO is approved on the spot. Once it is claimed the map is scoped to that organisation's own stations.",
    targets: [
      { label: "Dashboard", path: "/dashboard" },
      { label: "Claim flow", path: "/dashboard/claim" },
      { label: "Map", path: "/" },
    ],
  },
  {
    email: "manual-test@gmail.com",
    name: "MRO manager, free mailbox",
    exercises:
      "A gmail address never auto-approves, so the same claim queues for manual review instead.",
    targets: [
      { label: "Dashboard", path: "/dashboard" },
      { label: "Claim flow", path: "/dashboard/claim" },
      { label: "Map", path: "/" },
    ],
  },
  {
    email: "ops@test-airline.example.com",
    name: "Airline account",
    exercises:
      "Member of Demo Air already — no claim step. Airlines are not MROs, so this one sees the whole map, not a scoped one.",
    targets: [
      { label: "Airline dashboard", path: "/airline" },
      { label: "Map", path: "/" },
    ],
  },
  {
    email: "markbobkov@gmail.com",
    name: "Administrator",
    exercises:
      "The review queue: claims, proposed approvals and airline registrations. Also bypasses the membership check, so /dashboard/<any-id> opens.",
    targets: [
      { label: "Review queue", path: "/admin" },
      { label: "Dashboard", path: "/dashboard" },
      { label: "Map", path: "/" },
    ],
  },
];

export function isDevAccount(email: string): boolean {
  return DEV_ACCOUNTS.some((a) => a.email === email);
}
