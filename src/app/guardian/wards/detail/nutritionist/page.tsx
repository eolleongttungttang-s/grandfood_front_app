"use client";

import { Suspense } from "react";

import { GuardianWardNutritionistPageClient } from "./page-client";

export default function GuardianWardNutritionistPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col gap-4 pb-6" />}>
      <GuardianWardNutritionistPageClient />
    </Suspense>
  );
}
