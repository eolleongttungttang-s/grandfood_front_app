"use client";

import { Suspense } from "react";

import { GuardianWardDetailPageClient } from "./page-client";

// static export(next.config.ts의 output: "export")는 서버가 없어 런타임에 임의의 id로
// 페이지를 새로 만들 수 없다 — 그래서 id를 경로 세그먼트(예전 wards/[id])가 아니라
// 쿼리스트링(?id=)으로 받는다. 정적 페이지는 이 detail 하나뿐이라 어떤 id든(런타임에
// 새로 등록된 대상자 포함) 문제없이 열람할 수 있다.
export default function GuardianWardDetailPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col gap-4 pb-6" />}>
      <GuardianWardDetailPageClient />
    </Suspense>
  );
}
