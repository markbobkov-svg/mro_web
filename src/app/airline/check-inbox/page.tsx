import Link from "next/link";

import { ResendForm } from "../../(account)/signup/check-inbox/ResendForm";

export const metadata = { title: "Confirm your e-mail — ONE4FIVE" };

export default function AirlineCheckInboxPage({
  searchParams,
}: {
  searchParams: { email?: string; verified?: string };
}) {
  const email = searchParams.email ?? "";
  const verified = searchParams.verified === "1";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-8 self-center text-center">
        <span className="block text-xl font-normal tracking-brand text-white">
          ONE<span className="text-accent-bright">4</span>FIVE
        </span>
        <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
          Airlines &amp; operators
        </span>
      </Link>

      <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-6">
        <h1 className="text-sm font-medium tracking-wide2 text-white">
          Confirm your e-mail
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/45">
          We sent a confirmation link
          {email ? (
            <>
              {" "}
              to <span className="text-white/85">{email}</span>
            </>
          ) : null}
          . Click it, then sign in.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-white/35">
          {verified
            ? "Your e-mail is on your airline's domain, so your account opens the moment you confirm — confirming is what proves the address is yours."
            : "We'll review your registration by hand. Confirming your e-mail comes first — it proves the address is yours."}
        </p>

        <div className="mt-5 border-t border-white/10 pt-4">
          <ResendForm email={email} />
        </div>

        <p className="mt-4 text-center text-xs text-white/35">
          <Link href="/login" className="text-white/70 transition hover:text-white">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
