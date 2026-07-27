import "server-only";

import { cookies } from "next/headers";

import {
  getUserByToken,
  refreshSession,
  signOutToken,
  type AuthTokens,
  type AuthUser,
} from "./authApi";
import { getAdminSupabase } from "./supabase";

export const ACCESS_COOKIE = "o4f_at";
export const REFRESH_COOKIE = "o4f_rt";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/** The signed-in person, as the dashboard needs them. */
export interface CurrentUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
  fullName: string | null;
  jobTitle: string | null;
  phone: string | null;
  isAdmin: boolean;
}

/**
 * Write the session. Only callable from a Server Action or Route Handler —
 * Next.js forbids mutating cookies while rendering.
 */
export function writeSession(tokens: AuthTokens): void {
  const jar = cookies();
  // Refresh tokens outlive access tokens; both are httpOnly so neither is
  // reachable from client JavaScript.
  jar.set(ACCESS_COOKIE, tokens.accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60,
  });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const jar = cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) await signOutToken(access);
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/**
 * Resolve the current user from the cookies.
 *
 * Returns null when signed out. Token refresh normally happens in middleware
 * (which can write cookies); if an access token expires mid-render this still
 * recovers the user via the refresh token, it just cannot persist the new one —
 * the next request through middleware will.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (!access && !refresh) return null;

  let authUser: AuthUser | null = null;

  if (access) {
    try {
      authUser = await getUserByToken(access);
    } catch {
      authUser = null;
    }
  }

  if (!authUser && refresh) {
    try {
      authUser = (await refreshSession(refresh)).user;
    } catch {
      return null;
    }
  }

  if (!authUser?.id) return null;
  return hydrate(authUser);
}

/** Join the auth user with their public.app_users profile row. */
async function hydrate(authUser: AuthUser): Promise<CurrentUser> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("app_users")
    .select("full_name, job_title, phone, is_admin")
    .eq("id", authUser.id)
    .maybeSingle();

  return {
    id: authUser.id,
    email: authUser.email,
    emailConfirmed: authUser.emailConfirmed,
    fullName: (data?.full_name as string | null) ?? null,
    jobTitle: (data?.job_title as string | null) ?? null,
    phone: (data?.phone as string | null) ?? null,
    isAdmin: Boolean(data?.is_admin),
  };
}

/**
 * Make sure a row exists in public.app_users for this account. Called after
 * sign-up and after the first successful sign-in, so accounts created before
 * this table existed still get one.
 */
export async function ensureAppUser(
  id: string,
  email: string,
  fields: { fullName?: string | null; jobTitle?: string | null; phone?: string | null } = {},
): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase.from("app_users").upsert(
    {
      id,
      email,
      ...(fields.fullName !== undefined ? { full_name: fields.fullName } : {}),
      ...(fields.jobTitle !== undefined ? { job_title: fields.jobTitle } : {}),
      ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
    },
    { onConflict: "id" },
  );
}
