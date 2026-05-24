import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_VALUE } from "@/lib/auth";

export default function HomePage() {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (session === SESSION_VALUE) {
    redirect("/dashboard");
  }
  redirect("/login");
}
