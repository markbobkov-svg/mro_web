/**
 * Absolute base URL of this deployment, used for the links inside confirmation
 * e-mails. Set NEXT_PUBLIC_SITE_URL in production — VERCEL_URL points at the
 * per-deployment hostname, which works but is not the domain users expect.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
