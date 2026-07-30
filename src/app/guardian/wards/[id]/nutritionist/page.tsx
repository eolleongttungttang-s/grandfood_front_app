import { WARDS } from "@/lib/ward-registry";
import { GuardianWardNutritionistPageClient } from "./page-client";

export function generateStaticParams() {
  return WARDS.map((ward) => ({ id: ward.id }));
}

export default function GuardianWardNutritionistPage() {
  return <GuardianWardNutritionistPageClient />;
}
