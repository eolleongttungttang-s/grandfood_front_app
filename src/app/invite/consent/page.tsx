"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { resolveInviteByCode, toFormState, inviteFormStore } from "@/lib/invite";
import { getWardInviteByCode } from "@/lib/ward-invite";
import { useLocalStore } from "@/lib/use-store";
import { ConsentView } from "@/components/invite/consent-view";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/components/app/top-bar";

function InviteConsentPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const invite = resolveInviteByCode(code);
  const rawInvite = code ? getWardInviteByCode(code) : null;
  const formState = useLocalStore(inviteFormStore);

  useEffect(() => {
    if (invite) inviteFormStore.write(toFormState(invite));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- code가 바뀔 때만 초안을 다시 채운다
  }, [code]);

  if (!invite || !rawInvite) {
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
      guardianLoginId={rawInvite.guardianLoginId}
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
