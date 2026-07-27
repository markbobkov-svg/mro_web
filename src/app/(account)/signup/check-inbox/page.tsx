import Link from "next/link";

import { ResendForm } from "./ResendForm";

export const metadata = { title: "Confirm your e-mail — ONE4FIVE" };

export default function CheckInboxPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = searchParams.email ?? "";

  return (
    <div className="rounded-[2px] border border-white/10 bg-[#141414]/60 p-6">
      <h1 className="text-sm font-medium tracking-wide2 text-white">Confirm your e-mail</h1>
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
        Confirming proves the address is yours — that is what lets a claim on an
        organisation with a matching domain be approved automatically.
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
  );
}
