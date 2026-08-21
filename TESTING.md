# Testing the organisation dashboard

Throwaway accounts and a fake organisation for walking through the dashboard by
hand. Everything here is disposable — see [Cleanup](#cleanup) when you are done.

**Live:** https://mro-web.vercel.app

## Accounts

All have a confirmed e-mail already, so nothing depends on mail delivery (which
is still limited — see the SMTP item in `CLAUDE.md`).

| Sign in as | Password | Exercises |
|---|---|---|
| `manager@test-mro.example.com` | `Demo-2026-test` | Domain matches the organisation's website → **claim is approved instantly** |
| `manual-test@gmail.com` | `Demo-2026-test` | Free mailbox → **claim goes to the manual queue** |
| `ops@test-airline.example.com` | `Demo-2026-test` | **Airline account** — lands on `/airline`, manages the demo airline below |
| `markbobkov@gmail.com` | *(your own — not stored here)* | Administrator: the review queue at `/admin` |

The two `…-mro`/`gmail` accounts only ever reach the demo organisation; the
airline account only its demo airline. None are administrators.

## The demo organisation

**Demo MRO (ONE4FIVE test)** — a fabricated Part-145 organisation, seeded with
one EASA approval (`DE.145.DEMO`), three scope lines and one scraped contact, so
there is something real to edit and something to propose changes against.

It has **no station**, which is what keeps it off the public map: markers are
built from `organisation_stations`, so an organisation without one is invisible
to visitors while still being claimable from the dashboard. Verified — the
public search does not return it.

## The demo airline

**Demo Air (ONE4FIVE test)** — a fabricated row in `airlines`, already linked to
`ops@test-airline.example.com` through `airline_members` (so there is no claim
step; the account lands straight on `/airline`). Airlines never appear on the
public map, so it is invisible to visitors. The airline dashboard shows the
airline's register details (read-only) and the account holder's own contact
details (editable). Because this account *is* an airline and not an MRO, it sees
the **whole** map — the "showing only your stations" note is for MRO members,
who are scoped to their own network.

## A run through the whole flow

1. **Sign in** as `manager@test-mro.example.com` → you land on `/dashboard`.
2. **Claim it.** *Claim an organisation* → type `Demo` → pick it. A green notice
   says your address matches the organisation → *Claim and start editing*.
   Access is granted on the spot, no review.
3. **Edit the profile.** Tagline, About, and the AOG desk numbers → *Save
   profile*. This publishes immediately.
4. **Take over the contacts.** *Import them and take over* copies the scraped
   contact so you can edit it. From then on your contacts replace the scraped
   ones on the public card.
5. **Propose something regulatory.** Approvals → *Propose a missing approval* →
   fill in and send. It appears under *Change requests* as pending — and
   crucially, nothing is written to the approvals table yet.
6. **Try the other path.** Sign out, sign in as `manual-test@gmail.com`, claim
   the same organisation. Free mailbox, so an amber notice explains it will be
   reviewed by a person, and the claim queues instead.
7. **Review as admin.** Sign in with your own account → *Review queue*. Both
   items are waiting: the gmail claim and the proposed approval. Approving the
   change writes it to the approvals table and it goes live.

## Two things that will trip you up

**Your admin account bypasses the membership check.** Opening
`/dashboard/<any-organisation-id>` as an administrator works for *any*
organisation — that is deliberate (see the admin section in `CLAUDE.md`). So to
see what an ordinary organisation actually sees, use `manager@…`, not your admin
account.

**Signing up from scratch cannot be tested honestly yet.** `/signup` sends a
confirmation link through Supabase's built-in mailer, which on this project only
delivers to the project team's own addresses. Your own address will receive it;
a stranger's will not. That is the SMTP item in `CLAUDE.md`, and it is what gates
opening the dashboard to real organisations.

## Cleanup

When you are finished, remove the demo organisation and both test accounts.
Order matters — the dashboard tables reference the organisation:

```sql
-- in the Supabase SQL editor
with demo as (
  select id from public.organisations where name = 'Demo MRO (ONE4FIVE test)'
)
delete from public.organisation_change_requests  where organisation_id in (select id from demo);
-- repeat for: organisation_managed_contacts, organisation_managed_station_scope,
--             organisation_profiles, organisation_claims, organisation_members,
--             organisation_scope, organisation_approvals, organisation_contacts
delete from public.organisations where name = 'Demo MRO (ONE4FIVE test)';

-- the demo airline and its membership
delete from public.airline_members
 where airline_id in (select id from public.airlines where name = 'Demo Air (ONE4FIVE test)');
delete from public.airlines where name = 'Demo Air (ONE4FIVE test)';

delete from public.app_users
 where email in ('manager@test-mro.example.com', 'manual-test@gmail.com',
                 'ops@test-airline.example.com');
```

The three auth accounts themselves are removed from Authentication → Users in the
Supabase dashboard.

Delete this file once the accounts are gone — it is only useful while they
exist, and it should not survive into a public repository.
