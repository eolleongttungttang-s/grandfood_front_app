"use client";

import { Suspense } from "react";

import { GuardianWardSurveyPageClient } from "./page-client";

export default function GuardianWardSurveyPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col" />}>
      <GuardianWardSurveyPageClient />
    </Suspense>
  );
}
