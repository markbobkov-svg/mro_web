"use server";

import { redirect } from "next/navigation";

import {
  AuthError,
  resendConfirmation,
  sendPasswordReset,
  signInWithPassword,
  signUp,
} from "@/lib/authApi";
import { clearSession, ensureAppUser, writeSession } from "@/lib/session";
import { resolveHomePath } from "@/lib/guards";
import { siteUrl } from "@/lib/siteUrl";

export interface FormState {
  error?: string;
  notice?: string;
}

function str(data: FormData, key: string): string {
  const v = data.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function signUpAction(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const email = str(data, "email").toLowerCase();
  const password = str(data, "password");
  const fullName = str(data, "fullName");
  const jobTitle = str(data, "jobTitle");

  if (!email || !password) return { error: "Enter your work e-mail and a password." };
  if (password.length < 10) {
    return { error: "Use at least 10 characters for the password." };
  }

  try {
    const { user } = await signUp(email, password, `${siteUrl()}/login?confirmed=1`);
    if (user.id) {
      await ensureAppUser(user.id, email, {
        fullName: fullName || null,
        jobTitle: jobTitle || null,
      });
    }
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "user_already_exists" || /already registered/i.test(err.message)) {
        return { error: "That e-mail already has an account — sign in instead." };
      }
      return { error: err.message };
    }
    throw err;
  }

  redirect(`/signup/check-inbox?email=${encodeURIComponent(email)}`);
}

export async function signInAction(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const email = str(data, "email").toLowerCase();
  const password = str(data, "password");
  const rawNext = str(data, "next");

  if (!email || !password) return { error: "Enter your e-mail and password." };

  let userId = "";
  try {
    const { tokens, user } = await signInWithPassword(email, password);
    writeSession(tokens);
    userId = user.id;
  } catch (err) {
    if (err instanceof AuthError) {
      if (/email not confirmed/i.test(err.message)) {
        return {
          error:
            "Confirm your e-mail first — check your inbox for the link we sent.",
        };
      }
      if (err.status === 400) return { error: "Wrong e-mail or password." };
      return { error: err.message };
    }
    throw err;
  }

  // Accounts created before app_users existed still get a profile row.
  if (userId) await ensureAppUser(userId, email);

  // Honour an explicit destination (a protected page bounced them to login);
  // otherwise send them to whichever dashboard fits — airlines to /airline, the
  // rest to /dashboard.
  const explicit =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && rawNext !== "/dashboard"
      ? rawNext
      : null;
  const dest = explicit ?? (userId ? await resolveHomePath(userId) : "/dashboard");

  redirect(dest);
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/");
}

export async function resendConfirmationAction(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const email = str(data, "email").toLowerCase();
  if (!email) return { error: "Enter your e-mail." };
  try {
    await resendConfirmation(email, `${siteUrl()}/login?confirmed=1`);
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message };
    throw err;
  }
  return { notice: "Sent — check your inbox again." };
}

export async function requestPasswordResetAction(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const email = str(data, "email").toLowerCase();
  if (!email) return { error: "Enter your e-mail." };
  try {
    await sendPasswordReset(email, `${siteUrl()}/login`);
  } catch (err) {
    if (err instanceof AuthError && err.status !== 400) return { error: err.message };
    // 400 usually means "no such user" — don't confirm which addresses exist.
  }
  return {
    notice: "If that address has an account, a reset link is on its way.",
  };
}
