import { WARDS } from "@/lib/wards";
import { GuardianWardDetailPageClient } from "./page-client";

// static export는 서버가 없어 런타임에 임의의 id를 처리할 수 없다 — 빌드 시점에 알고 있는
// 목업 대상자(WARDS) id만 미리 정적 HTML로 만들어둔다.
export function generateStaticParams() {
  return WARDS.map((ward) => ({ id: ward.id }));
}

export default function GuardianWardDetailPage() {
  return <GuardianWardDetailPageClient />;
}
