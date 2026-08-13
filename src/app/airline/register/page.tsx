import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Register your airline — ONE4FIVE" };
export const dynamic = "force-dynamic";

export default async function AirlineRegisterPage() {
  // A signed-in account already has a home; send it there rather than showing a
  // second sign-up form.
  const user = await getCurrentUser();
  if (user) redirect("/airline");

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
      <RegisterForm />
    </div>
  );
}
