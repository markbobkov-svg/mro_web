import Link from "next/link";

/**
 * Centred single-column shell for sign-in / sign-up.
 *
 * globals.css sets `overflow: hidden` on body so the map can own the viewport;
 * these pages scroll inside their own container instead.
 */
export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-viewport overflow-y-auto scroll-thin bg-base-900">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-12">
        <Link href="/" className="mb-8 self-center text-center">
          <span className="block text-lg font-semibold tracking-brand text-white">
            ONE4FIVE
          </span>
          <span className="mt-1 block text-[11px] uppercase tracking-wide2 text-neutral-500">
            Part-145 across Europe
          </span>
        </Link>
        {children}
      </div>
    </div>
  );
}
