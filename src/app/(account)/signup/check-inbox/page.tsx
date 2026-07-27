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
    <div className="rounded-xl border border-base-600 bg-base-800 p-6">
      <h1 className="text-base font-semibold text-white">Confirm your e-mail</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">
        We sent a confirmation link
        {email ? (
          <>
            {" "}
            to <span className="text-neutral-200">{email}</span>
          </>
        ) : null}
        . Click it, then sign in.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Confirming proves the address is yours — that is what lets a claim on an
        organisation with a matching domain be approved automatically.
      </p>

      <div className="mt-5 border-t border-base-600 pt-4">
        <ResendForm email={email} />
      </div>

      <p className="mt-4 text-center text-xs text-neutral-500">
        <Link href="/login" className="text-neutral-300 transition hover:text-white">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
