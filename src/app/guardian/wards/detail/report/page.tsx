"use client";

import { Suspense } from "react";

import { GuardianWardReportPageClient } from "./page-client";

export default function GuardianWardReportPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col gap-4 pb-6" />}>
      <GuardianWardReportPageClient />
    </Suspense>
  );
}
