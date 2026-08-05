"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { DeclinedView } from "@/components/invite/declined-view";

function InviteDeclinedPageContent() {
  const searchParams = useSearchParams();
  const guardianName = searchParams.get("guardianName") ?? "보호자";

  return <DeclinedView guardianName={guardianName} />;
}

export default function InviteDeclinedPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col gap-4 pb-6" />}>
      <InviteDeclinedPageContent />
    </Suspense>
  );
}
