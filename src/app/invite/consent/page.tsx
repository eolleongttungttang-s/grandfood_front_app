"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { InviteRequest, resolveInviteByCode, toFormState, inviteFormStore } from "@/lib/invite";
import { useLocalStore } from "@/lib/use-store";
import { ConsentView } from "@/components/invite/consent-view";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

function InviteConsentPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const formState = useLocalStore(inviteFormStore);

  // 초대 조회가 이제 백엔드 호출(GET /wards/invites/{code})이라 동기적으로 못 구한다 —
  // 발급한 기기가 아닌 다른 기기(어르신 휴대폰 등)로 스캔해도 서버가 답을 알고 있어야
  // 하기 때문. null=아직 확인 안 됨(로딩), undefined=조회 끝났는데 없음(유효하지 않음).
  const [invite, setInvite] = useState<InviteRequest | null | undefined>(null);

  useEffect(() => {
    let cancelled = false;
    resolveInviteByCode(code).then((result) => {
      if (cancelled) return;
      setInvite(result ?? undefined);
      if (result) inviteFormStore.write(toFormState(result));
    });
    return () => {
      cancelled = true;
    };
    // code가 바뀌면 다시 조회한다 — 그 사이엔 이전 invite가 잠깐 남아있을 수 있지만
    // (곧바로 setState를 effect 본문에서 동기 호출하는 걸 피함), 같은 세션에서 code가
    // 바뀌는 건 실질적으로 없는 경우라 감수한다.
  }, [code]);

  if (invite === null) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title="가입 정보 확인" subtitle="GrandFood" />
        <div className="flex flex-1 items-center justify-center px-5">
          <p className="text-sm text-muted-foreground">초대 정보를 확인하고 있어요...</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-6">
        <TopBar title="가입 정보 확인" subtitle="GrandFood" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <p className="text-sm text-foreground">유효하지 않은 초대예요.</p>
          <p className="text-xs text-muted-foreground">
            문자로 받은 링크가 만료됐거나 잘못됐을 수 있어요. 보호자님께 새로 요청해 주세요.
          </p>
          <Button nativeButton={false} render={<Link href="/" />}>
            처음으로
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ConsentView
      guardianName={invite.guardianName}
      guardianLoginId={invite.guardianLoginId}
      code={code as string}
      defaultValues={formState}
    />
  );
}

export default function InviteConsentPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 flex-col gap-4 pb-6" />}>
      <InviteConsentPageContent />
    </Suspense>
  );
}
