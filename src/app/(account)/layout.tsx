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
    <div className="h-viewport overflow-y-auto scroll-thin bg-black">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-12">
        <Link href="/" className="mb-8 self-center text-center">
          <span className="block text-xl font-normal tracking-brand text-white">
            ONE<span className="text-accent-bright">4</span>FIVE
          </span>
          <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-brand text-accent-bright/80">
            Part-145 · MRO · Europe
          </span>
        </Link>
        {children}
      </div>
    </div>
  );
}
