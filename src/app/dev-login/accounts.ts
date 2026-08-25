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
}

// Every one of them lands on the map, the way a visitor arrives — the
// dashboard is a click away from there, via the button in the map's corner.
export const DEV_ACCOUNTS: DevAccount[] = [
  {
    email: "manager@test-mro.example.com",
    name: "MRO manager",
  },
  {
    email: "manual-test@gmail.com",
    name: "MRO manager, free mailbox",
  },
  {
    email: "ops@test-airline.example.com",
    name: "Airline account",
  },
  {
    email: "markbobkov@gmail.com",
    name: "Administrator",
  },
];

export function isDevAccount(email: string): boolean {
  return DEV_ACCOUNTS.some((a) => a.email === email);
}
