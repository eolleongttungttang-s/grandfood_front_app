"use client";

import { useState } from "react";
import { Siren } from "lucide-react";
import { toast } from "sonner";

import { ConfirmOverlay } from "@/components/app/confirm-overlay";
import { raiseSos, reportSosToBackend } from "@/lib/sos-store";
import { speakOnDemand } from "@/lib/accessibility";
import { getWard } from "@/lib/wards";

export function SosButton({ wardId, wardName }: { wardId: string; wardName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute right-4 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-white shadow-lg transition-transform active:scale-95"
        aria-label="SOS 긴급 호출"
      >
        <Siren className="h-6 w-6" />
      </button>

      <ConfirmOverlay
        open={open}
        title="위급 상황이신가요?"
        description="확인을 누르면 보호자에게 즉시 알림을 보내드려요."
        confirmLabel="보호자에게 알리기"
        tone="danger"
        onConfirm={() => {
          raiseSos(wardId, wardName);
          setOpen(false);
          toast.success("보호자에게 SOS를 보냈어요.");
          // 더 자연스러운 Azure 음성으로 안내한다(2026-08-24 피드백) — speakOnDemand는
          // accessibility.ts의 speakRaw를 거쳐 백엔드 Azure Speech로 먼저 시도하고,
          // 실패/시간초과(10초)면 자동으로 브라우저 내장 음성으로 폴백하므로 무음이 되진
          // 않는다. 다만 브라우저 음성만 쓰던 speakUrgent보다는 최악의 경우 응답이
          // 늦어질 수 있다는 트레이드오프는 감수한다.
          speakOnDemand("보호자에게 에스오에스를 보냈어요.");
          // 실제 발송(POST /app/elder/{id}/sos)은 위 로컬 반응이 끝난 뒤 background로 보낸다 —
          // await 안 함(reportSosToBackend 자체가 실패를 조용히 삼킨다, sos-store.ts 참고).
          const ward = getWard(wardId);
          if (ward) {
            reportSosToBackend({ mockWardId: wardId, name: ward.name, age: ward.age, address: ward.address });
          }
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
