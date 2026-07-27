// Domain matching for the claim flow.
//
// A confirmed email address at the organisation's own domain is the evidence
// that lets a claim skip the manual queue. Everything here is deliberately
// conservative: when in doubt, return false and let a human look at it.

/** Mailbox providers that prove nothing about who someone works for. */
const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "mail.ru",
  "yandex.ru",
  "yandex.com",
  "protonmail.com",
  "proton.me",
  "tutanota.com",
  "zoho.com",
  "fastmail.com",
  "seznam.cz",
  "wp.pl",
  "o2.pl",
  "interia.pl",
  "libero.it",
  "orange.fr",
  "free.fr",
  "wanadoo.fr",
  "t-online.de",
  "bluewin.ch",
  "telenet.be",
  "ziggo.nl",
  "hotmail.fr",
  "hotmail.it",
  "hotmail.es",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.it",
  "yahoo.es",
]);

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL.has(domain.trim().toLowerCase());
}

/** `someone@Line.Maint.Example.com` -> `line.maint.example.com` */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.includes(".") ? domain : null;
}

/** `https://www.Example.com/maintenance` -> `example.com` */
export function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  const raw = website.trim();
  if (!raw) return null;

  let host: string;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }

  host = host.replace(/^www\./, "");
  return host.includes(".") ? host : null;
}

/**
 * True when an email domain and a website belong to the same organisation.
 *
 * Exact match, or one is a sub-domain of the other — `mail.lufthansa-technik.com`
 * and `lufthansa-technik.com` are the same company, `notlufthansa-technik.com`
 * is not, hence the label-boundary check rather than a bare `endsWith`.
 *
 * A two-label public suffix (`co.uk`, `com.tr`, …) is never treated as a shared
 * parent: `a.co.uk` and `b.co.uk` are unrelated companies.
 */
export function domainsMatch(
  emailHost: string | null,
  siteHost: string | null,
): boolean {
  if (!emailHost || !siteHost) return false;
  if (isFreeMailDomain(emailHost)) return false;

  const a = emailHost.replace(/^www\./, "");
  const b = siteHost.replace(/^www\./, "");
  if (a === b) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;

  // The shared part must be a real registrable domain, not just a public suffix.
  if (countLabels(shorter) < 2) return false;
  if (countLabels(shorter) === 2 && MULTIPART_SUFFIXES.has(shorter)) return false;

  return longer.endsWith(`.${shorter}`);
}

function countLabels(host: string): number {
  return host.split(".").filter(Boolean).length;
}

/** Common two-label public suffixes across the European authorities we cover. */
const MULTIPART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ltd.uk",
  "plc.uk",
  "me.uk",
  "ac.uk",
  "gov.uk",
  "com.tr",
  "org.tr",
  "gov.tr",
  "com.pl",
  "com.es",
  "com.pt",
  "com.gr",
  "com.cy",
  "com.mt",
  "com.hr",
  "com.ua",
  "com.ru",
  "co.rs",
  "com.de",
  "co.at",
  "or.at",
  "co.nl",
  "com.se",
  "com.ro",
  "com.bg",
  "com.ee",
  "com.lv",
  "co.il",
  "com.ch",
  "com.fr",
  "com.it",
  "com.ie",
  "co.no",
  "com.hu",
  "com.sk",
  "com.si",
  "com.mk",
  "com.al",
  "com.ba",
  "com.md",
  "com.ge",
  "com.az",
  "com.by",
  "com.kz",
]);

/**
 * The domains a claim on this organisation may auto-verify against: its own
 * website plus any corporate domain already on file in the scraped contacts.
 */
export function acceptableDomains(
  website: string | null | undefined,
  contactEmails: (string | null | undefined)[] = [],
): string[] {
  const out = new Set<string>();

  const site = websiteDomain(website);
  if (site && !isFreeMailDomain(site)) out.add(site);

  for (const email of contactEmails) {
    if (!email) continue;
    const host = emailDomain(email);
    if (host && !isFreeMailDomain(host)) out.add(host);
  }
  return [...out];
}
