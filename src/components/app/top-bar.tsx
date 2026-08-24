import { ChevronLeft } from "lucide-react";

import { GrandFoodMark } from "@/components/brand/grandfood-logo";

export function TopBar({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** 왼쪽 위에 뒤로가기 버튼을 추가한다 — 없으면(기본) 지금처럼 로고만 보인다. 홈 탭이
   *  아니라 다른 화면(마이 등)에서 들어와서 하단 탭 없이는 못 돌아가는 화면(구독 관리 등,
   *  2026-08-21 피드백)에 넘긴다. 실제 이동 방식(router.back() 등)은 호출부가 정한다. */
  onBack?: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-2.5">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="뒤로가기"
            className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <GrandFoodMark className="h-8 w-8 shrink-0 rounded-lg" />
        <div className="flex flex-col gap-0.5">
          {subtitle && (
            <span className="text-xs font-medium text-muted-foreground">
              {subtitle}
            </span>
          )}
          <h1 className="text-lg font-extrabold tracking-tight text-foreground">
            {title}
          </h1>
        </div>
      </div>
      {right}
    </header>
  );
}
