// Thin wrapper over the Supabase Auth REST API.
//
// Deliberately plain `fetch` rather than the supabase-js auth client: the
// browser never talks to Supabase in this app, so there is no session to
// persist client-side. The server calls these, keeps the tokens in httpOnly
// cookies (see session.ts) and hands the UI nothing but a user object.
//
// No `next/headers` import here — middleware.ts needs this module too.

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
}

export interface AuthUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
}

export class AuthError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

function authUrl(path: string): string {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("Missing SUPABASE_URL");
  return `${base.replace(/\/$/, "")}/auth/v1${path}`;
}

function apiKey(): string {
  const key = process.env.SUPABASE_KEY;
  if (!key) throw new Error("Missing SUPABASE_KEY");
  return key;
}

async function authFetch(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<unknown> {
  const { token, headers, ...rest } = init;
  const res = await fetch(authUrl(path), {
    ...rest,
    cache: "no-store",
    headers: {
      apikey: apiKey(),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!res.ok) {
    const message =
      (body.error_description as string) ||
      (body.msg as string) ||
      (body.message as string) ||
      `Authentication failed (${res.status})`;
    const code =
      (body.error_code as string) || (body.error as string) || null;
    throw new AuthError(message, res.status, code);
  }
  return body;
}

function readUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: String(raw.id ?? ""),
    email: String(raw.email ?? ""),
    emailConfirmed: Boolean(raw.email_confirmed_at || raw.confirmed_at),
  };
}

function readTokens(raw: Record<string, unknown>): AuthTokens {
  const expiresIn = Number(raw.expires_in ?? 3600);
  return {
    accessToken: String(raw.access_token ?? ""),
    refreshToken: String(raw.refresh_token ?? ""),
    expiresAt:
      Number(raw.expires_at ?? 0) ||
      Math.floor(Date.now() / 1000) + expiresIn,
  };
}

/**
 * Register an account. The project has `mailer_autoconfirm = false`, so this
 * sends a confirmation mail and the account cannot sign in until the link is
 * clicked — which is exactly what makes the "email domain proves you work
 * there" check in the claim flow mean anything.
 */
export async function signUp(
  email: string,
  password: string,
  redirectTo: string,
): Promise<{ user: AuthUser; needsConfirmation: boolean }> {
  const raw = (await authFetch(
    `/signup?redirect_to=${encodeURIComponent(redirectTo)}`,
    { method: "POST", body: JSON.stringify({ email, password }) },
  )) as Record<string, unknown>;

  // With confirmations on, /signup returns the user without a session.
  const user = readUser(
    (raw.user as Record<string, unknown> | undefined) ?? raw,
  );
  return { user, needsConfirmation: !user.emailConfirmed };
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ tokens: AuthTokens; user: AuthUser }> {
  const raw = (await authFetch("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })) as Record<string, unknown>;

  return {
    tokens: readTokens(raw),
    user: readUser((raw.user as Record<string, unknown>) ?? {}),
  };
}

export async function refreshSession(
  refreshToken: string,
): Promise<{ tokens: AuthTokens; user: AuthUser }> {
  const raw = (await authFetch("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  })) as Record<string, unknown>;

  return {
    tokens: readTokens(raw),
    user: readUser((raw.user as Record<string, unknown>) ?? {}),
  };
}

export async function getUserByToken(accessToken: string): Promise<AuthUser> {
  const raw = (await authFetch("/user", {
    token: accessToken,
  })) as Record<string, unknown>;
  return readUser(raw);
}

export async function signOutToken(accessToken: string): Promise<void> {
  try {
    await authFetch("/logout", { method: "POST", token: accessToken });
  } catch {
    // A already-expired token gives 401 here; the cookies get cleared anyway.
  }
}

export async function sendPasswordReset(
  email: string,
  redirectTo: string,
): Promise<void> {
  await authFetch(`/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resendConfirmation(
  email: string,
  redirectTo: string,
): Promise<void> {
  await authFetch(`/resend?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ type: "signup", email }),
  });
}
