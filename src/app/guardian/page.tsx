import { redirect } from "next/navigation";

export default function GuardianIndexPage() {
  redirect("/guardian/home");
}
