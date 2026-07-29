import { WARDS } from "@/lib/wards";
import { GuardianWardReportPageClient } from "./page-client";

export function generateStaticParams() {
  return WARDS.map((ward) => ({ id: ward.id }));
}

export default function GuardianWardReportPage() {
  return <GuardianWardReportPageClient />;
}
