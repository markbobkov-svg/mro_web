import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create an account — ONE4FIVE" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return <SignupForm />;
}
