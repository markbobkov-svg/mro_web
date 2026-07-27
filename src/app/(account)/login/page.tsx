import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in — ONE4FIVE" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; confirmed?: string };
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const next =
    searchParams.next && searchParams.next.startsWith("/")
      ? searchParams.next
      : "/dashboard";

  return <LoginForm next={next} confirmed={searchParams.confirmed === "1"} />;
}
