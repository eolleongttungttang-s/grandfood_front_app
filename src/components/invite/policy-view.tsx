"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

const POLICY_SECTIONS = [
  {
    title: "1. 수집하는 개인정보 항목",
    body: "성명, 휴대전화번호, 배송지 주소(상세주소 포함), 식사 여부 기록",
  },
  {
    title: "2. 수집 및 이용 목적",
    body: "도시락 배송, 배송 일정 안내, 식사 여부 기록 확인 및 보호자 공유",
  },
  {
    title: "3. 제3자 제공(공유) 대상",
    body: "본인이 등록한 보호자 계정에 한해 성명, 연락처, 식사 여부 기록이 공유돼요",
  },
  {
    title: "4. 보관 및 파기",
    body: "서비스 탈퇴 시까지 보관하며, 탈퇴 시 지체 없이 파기해요. 동의를 거부하면 입력된 정보는 즉시 삭제돼요",
  },
  {
    title: "5. 동의 철회 및 권리 행사",
    body: "언제든 앱 내 [내 정보] 메뉴 또는 고객센터를 통해 동의를 철회하거나 보호자 연동을 해제할 수 있어요",
  },
];

export function PolicyView() {
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar
        title="개인정보처리방침"
        subtitle="GrandFood"
        right={
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <X />
          </Button>
        }
      />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          {POLICY_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-foreground">{section.title}</span>
              <p className="text-sm leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
          ))}
        </div>

        <Button variant="outline" size="lg" className="w-full" onClick={() => router.back()}>
          확인 화면으로 돌아가기
        </Button>
      </div>
    </div>
  );
}
