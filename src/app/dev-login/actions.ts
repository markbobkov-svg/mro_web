"use server";

import { redirect } from "next/navigation";

import type { AuthTokens } from "@/lib/authApi";
import { clearSession, writeSession } from "@/lib/session";
import { isDevAccount } from "./accounts";

/**
 * TEMPORARY — passwordless sign-in for the test accounts in TESTING.md.
 *
 * How it works without a password: this app already holds a **service_role**
 * key, so it can ask GoTrue's admin API to mint a magic-link token for an
 * address (`/admin/generate_link` — it generates, it does not send mail, so
 * none of the SMTP limits apply) and then redeem that token itself
 * (`/verify`). What comes back is an ordinary session — same access/refresh
 * pair `signInWithPassword` returns — so it goes into the same httpOnly
 * cookies and every guard downstream behaves exactly as in real life. This is
 * also why the admin account works here even though its password is not in
 * TESTING.md.
 *
 * The obvious flip side: anyone who can reach this page becomes any of those
 * four accounts, administrator included. The allowlist in accounts.ts is the
 * only thing narrowing it. Delete this folder before the site is shown to
 * anyone.
 */

interface DevSession {
  tokens: AuthTokens;
  userId: string;
}

async function gotrue(
  path: string,
  body: unknown,
  auth = false,
): Promise<Record<string, unknown>> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!base || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_KEY");

  const res = await fetch(`${base.replace(/\/$/, "")}/auth/v1${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const message =
      (parsed.msg as string) ||
      (parsed.error_description as string) ||
      (parsed.message as string) ||
      `Supabase said ${res.status}`;
    throw new Error(message);
  }
  return parsed;
}

async function signInAsTestAccount(email: string): Promise<DevSession> {
  // 1. Mint a one-shot magic-link token for the address (admin, service_role).
  const link = await gotrue("/admin/generate_link", { type: "magiclink", email }, true);
  const hashed = String(link.hashed_token ?? "");
  if (!hashed) throw new Error("No token came back for that address");

  // 2. Redeem it here instead of in a mail client.
  const session = await gotrue("/verify", {
    type: "magiclink",
    token_hash: hashed,
  });

  const user = (session.user as Record<string, unknown> | undefined) ?? {};
  const expiresIn = Number(session.expires_in ?? 3600);
  return {
    tokens: {
      accessToken: String(session.access_token ?? ""),
      refreshToken: String(session.refresh_token ?? ""),
      expiresAt:
        Number(session.expires_at ?? 0) || Math.floor(Date.now() / 1000) + expiresIn,
    },
    userId: String(user.id ?? ""),
  };
}

export async function devSignInAction(data: FormData): Promise<void> {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const raw = String(data.get("dest") ?? "/");
  const dest = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  if (!isDevAccount(email)) {
    redirect("/dev-login?error=Not+one+of+the+test+accounts");
  }

  try {
    const { tokens } = await signInAsTestAccount(email);
    if (!tokens.accessToken) throw new Error("Supabase returned no session");
    // Straight into the same httpOnly cookies a real sign-in writes.
    writeSession(tokens);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed";
    redirect(`/dev-login?error=${encodeURIComponent(message)}`);
  }

  redirect(dest);
}

export async function devSignOutAction(): Promise<void> {
  await clearSession();
  redirect("/dev-login");
}
