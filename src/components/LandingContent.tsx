"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";

import { signInAction, type FormState } from "@/app/(account)/actions";
import { RegisterForm } from "@/app/airline/register/RegisterForm";
import { SignupForm } from "@/app/(account)/signup/SignupForm";
import { Alert, SubmitButton } from "@/components/ui/Form";

/**
 * The signed-out landing's content column: the brand, the sign-in, and the two
 * marketing texts around it.
 *
 * Opening registration (the role picker, or a form) hides the headline, the
 * description and the footer blurb so the taller form centres in the viewport —
 * only the brand and the required OpenStreetMap credit stay. Owning the auth
 * mode here, rather than in a child, is what lets those texts react to it.
 *
 * Sign-in leads (most visits are returning users); "Register" switches to the
 * role-first sign-up, whose two forms are the same ones served at
 * /airline/register and /signup, reused so there is one path in.
 */
type Role = "airline" | "org";
const EMPTY: FormState = {};
const SHADOW = {
  textShadow: "0 1px 22px rgba(0,0,0,0.62), 0 1px 3px rgba(0,0,0,0.5)",
};

export default function LandingContent({
  organisationCount = 0,
}: {
  organisationCount?: number;
}) {
  const [mode, setMode] = useState<"login" | "role" | "form">("login");
  const [role, setRole] = useState<Role | null>(null);
  const count = organisationCount > 0 ? organisationCount : null;
  const isLogin = mode === "login";

  return (
    <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-5 py-16">
      {/* Brand */}
      <div className="text-center" style={SHADOW}>
        <span className="block text-2xl font-normal tracking-brand text-white">
          ONE<span className="text-accent-bright">4</span>FIVE
        </span>
        <span className="mt-2 block text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
          Part-145 · MRO · Europe
        </span>
      </div>

      {/* Headline — hidden while registering so the form can centre */}
      {isLogin ? (
        <div className="mt-12 text-center" style={SHADOW}>
          <h1 className="mx-auto max-w-2xl text-balance text-3xl font-light leading-tight tracking-wide2 text-white sm:text-[2.6rem]">
            Europe&rsquo;s Part-145 maintenance network, on one map.
          </h1>
        </div>
      ) : null}

      {/* Sign in — sits between the two texts; the whole reason to be here. */}
      <div className="mt-10">
        {mode === "login" ? (
          <LoginPanel onRegister={() => setMode("role")} />
        ) : mode === "role" ? (
          <RolePicker
            onPick={(r) => {
              setRole(r);
              setMode("form");
            }}
            onCancel={() => setMode("login")}
          />
        ) : (
          <div className="mx-auto w-full max-w-md">
            <button
              type="button"
              onClick={() => setMode("role")}
              className="mb-3 text-xs text-white/45 transition hover:text-white/80"
            >
              ← Choose a different role
            </button>
            {role === "airline" ? <RegisterForm /> : <SignupForm />}
          </div>
        )}
      </div>

      {/* Description + stat — hidden while registering */}
      {isLogin ? (
        <div className="mt-10 text-center" style={SHADOW}>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
            Search any airport and see which approved organisations work there —
            their approvals per authority, certified scope, and the desk to call
            when an aircraft is on the ground.
          </p>
          {count ? (
            <p className="mt-6 text-xs uppercase tracking-wide2 text-white/40">
              <span className="text-white/70">
                {count.toLocaleString("en-GB")}
              </span>{" "}
              Part-145 organisations · across Europe
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Footer blurb — hidden while registering */}
      {isLogin ? (
        <p className="mx-auto mt-14 max-w-md text-center text-[11px] leading-relaxed text-white/25">
          Data compiled from EASA and national aviation-authority registers.
          Access is free — an account keeps the map and the organisation data it
          holds for the industry it serves.
        </p>
      ) : null}

      {/* Basemap credit — always on while the map is shown (ODbL). */}
      <p
        className={`mx-auto max-w-md text-center text-[11px] leading-relaxed text-white/20 ${
          isLogin ? "mt-3" : "mt-12"
        }`}
      >
        Basemap ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 transition hover:text-white/40 hover:underline"
        >
          OpenStreetMap
        </a>{" "}
        contributors, rendered with{" "}
        <a
          href="https://protomaps.com"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 transition hover:text-white/40 hover:underline"
        >
          Protomaps
        </a>
        .
      </p>
    </div>
  );
}

function LoginPanel({ onRegister }: { onRegister: () => void }) {
  const [state, action] = useFormState(signInAction, EMPTY);
  const [email, setEmail] = useState("");
  const [emailBlurred, setEmailBlurred] = useState(false);

  // Reveal the password once an e-mail has been entered.
  const reveal =
    /^\S+@\S+/.test(email.trim()) || (emailBlurred && email.trim().length > 0);

  // No card: frosted-glass fields that sit straight on the map, so the sign-in
  // reads as part of the page rather than a boxed widget over it.
  const field =
    "w-full rounded-[2px] border border-white/15 bg-white/[0.06] px-4 py-3 text-sm " +
    "text-white placeholder:text-white/40 outline-none backdrop-blur-md transition " +
    "focus:border-accent/60 focus:bg-white/[0.10]";

  return (
    <div className="mx-auto w-full max-w-sm">
      {state.error ? (
        <div className="mb-3">
          <Alert kind="error">{state.error}</Alert>
        </div>
      ) : null}

      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value="/" />

        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailBlurred(true)}
          placeholder="Work e-mail"
          aria-label="Work e-mail"
          className={field}
        />

        {/* Password drops down once an e-mail is entered (grid-rows 0fr→1fr is a
            real height animation; the inner div clips it meanwhile). */}
        <div
          className={`grid transition-all duration-300 ease-out ${
            reveal ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="space-y-3">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required={reveal}
                placeholder="Password"
                aria-label="Password"
                className={field}
              />
              <SubmitButton className="w-full py-3" pendingLabel="Signing in…">
                Sign in
              </SubmitButton>
              <div className="text-right">
                <Link
                  href="/login?next=%2F"
                  className="text-xs text-white/35 transition hover:text-white/70"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </div>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-white/55">
        Don&rsquo;t have an account yet?{" "}
        <button
          type="button"
          onClick={onRegister}
          className="text-accent-bright transition hover:text-white"
        >
          Register
        </button>
      </p>
    </div>
  );
}

function RolePicker({
  onPick,
  onCancel,
}: {
  onPick: (role: Role) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-[2px] border border-white/10 bg-[#141414]/70 p-6 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide2 text-white">
            Create an account
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-white/40 transition hover:text-white/75"
          >
            Cancel
          </button>
        </div>
        <p className="mt-1 text-sm text-white/45">First, who are you?</p>

        <div className="mt-4 grid gap-3">
          <RoleOption
            onClick={() => onPick("airline")}
            eyebrow="Airlines & operators"
            title="I operate aircraft"
            body="Find MROs by airport, compare approvals and scope, keep an account."
          />
          <RoleOption
            onClick={() => onPick("org")}
            eyebrow="Part-145 organisations"
            title="I run a maintenance organisation"
            body="Claim your listing and keep your approvals, scope and contacts current."
          />
        </div>
      </div>
      <p className="mt-3 text-center text-sm text-white/45">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onCancel}
          className="text-accent-bright transition hover:text-white"
        >
          Log in
        </button>
      </p>
    </div>
  );
}

function RoleOption({
  onClick,
  eyebrow,
  title,
  body,
}: {
  onClick: () => void;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[2px] border border-white/10 bg-black/40 p-4 text-left transition
        hover:border-accent/50 hover:bg-accent/5"
    >
      <p className="text-[10px] uppercase tracking-wide2 text-accent-bright/80">
        {eyebrow}
      </p>
      <p className="mt-1.5 text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/45">{body}</p>
    </button>
  );
}
