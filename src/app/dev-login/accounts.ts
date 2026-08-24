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
  /** Where signing in as them lands. `/` is the map. */
  dest: string;
}

export const DEV_ACCOUNTS: DevAccount[] = [
  {
    email: "manager@test-mro.example.com",
    name: "MRO manager",
    dest: "/dashboard",
  },
  {
    email: "manual-test@gmail.com",
    name: "MRO manager, free mailbox",
    dest: "/dashboard",
  },
  {
    email: "ops@test-airline.example.com",
    name: "Airline account",
    dest: "/airline",
  },
  {
    email: "markbobkov@gmail.com",
    name: "Administrator",
    dest: "/admin",
  },
];

export function isDevAccount(email: string): boolean {
  return DEV_ACCOUNTS.some((a) => a.email === email);
}
