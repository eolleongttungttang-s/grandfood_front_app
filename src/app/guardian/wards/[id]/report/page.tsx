import { WARDS } from "@/lib/ward-registry";
import { GuardianWardReportPageClient } from "./page-client";

export function generateStaticParams() {
  return WARDS.map((ward) => ({ id: ward.id }));
}

export default function GuardianWardReportPage() {
  return <GuardianWardReportPageClient />;
}
