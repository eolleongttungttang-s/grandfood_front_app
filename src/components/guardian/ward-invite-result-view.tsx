"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { wardInviteStore } from "@/lib/ward-invite";
import { useLocalStore } from "@/lib/use-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

function formatExpiry(expiresAt: string) {
  const date = new Date(expiresAt);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}까지 유효 (발급 후 7일)`;
}

export function WardInviteResultView() {
  const invite = useLocalStore(wardInviteStore);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!invite) return;
    // TODO(backend): 실제로는 서버가 발급한 code로 어르신이 /invite/consent에 진입할 때
    // 해당 초대 데이터를 조회하게 된다. 지금은 프론트 mock이라 code만 쿼리로 실어둔다.
    const inviteLink = `${window.location.origin}/invite/consent?code=${invite.code}`;
    QRCode.toDataURL(inviteLink, { margin: 1, width: 220 }).then(setQrDataUrl);
  }, [invite]);

  if (!invite) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title="초대코드 발급" subtitle="GrandFood" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <p className="text-sm text-muted-foreground">아직 발급된 초대코드가 없어요.</p>
          <Button nativeButton={false} render={<Link href="/guardian/wards/new" />}>
            부모님 등록하러 가기
          </Button>
        </div>
      </div>
    );
  }

  // 위에서 이미 null 체크를 했지만, 아래 중첩 함수/JSX에서도 좁혀진 타입을 쓰기 위해 재바인딩
  const currentInvite = invite;

  function copyCode() {
    navigator.clipboard.writeText(currentInvite.code);
    toast.success("초대코드를 복사했어요.");
  }

  return (
    <div className="flex flex-1 flex-col gap-4 pb-6">
      <TopBar title="초대코드 발급" subtitle="GrandFood" />

      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground">{invite.name}님</span>

          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image가 다루기 부적합
            <img
              src={qrDataUrl}
              alt="초대 QR 코드"
              width={180}
              height={180}
              className="h-[180px] w-[180px] rounded-xl border border-border"
            />
          ) : (
            <div className="h-[180px] w-[180px] animate-pulse rounded-xl bg-muted" />
          )}

          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">초대코드</span>
            <span className="text-2xl font-extrabold tracking-[0.2em] text-foreground">
              {invite.code}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={copyCode}>
            <Copy />
            코드 복사
          </Button>
          <span className="text-xs text-muted-foreground">{formatExpiry(invite.expiresAt)}</span>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">{invite.phone}</span>
            {invite.smsSent && (
              <Badge className="bg-risk-normal text-risk-normal-foreground">SMS 발송됨</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            어르신 번호로 초대 문자를 보냈어요. 어르신이 문자 속 안내를 확인하고 직접
            시작 여부를 선택하세요.
          </p>
        </div>

        <Button
          size="lg"
          className="w-full"
          nativeButton={false}
          render={<Link href="/guardian/profile" />}
        >
          완료
        </Button>
      </div>
    </div>
  );
}
