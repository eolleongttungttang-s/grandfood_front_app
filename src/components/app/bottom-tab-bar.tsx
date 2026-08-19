"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabIcon = React.ComponentType<{ className?: string }>;

// 라우트 이동용(href, 지금까지 쓰던 방식)과 같은 화면 안에서 로컬 state로만 전환하는 탭
// (onClick, ward-detail-view.tsx의 개요/건강/기록 탭 등) 둘 다 이 컴포넌트 하나로 그린다 —
// 예전엔 후자를 쓰는 화면이 nav/버튼 마크업을 거의 그대로 복제해서, 여기(아이콘 크기·활성
// 색상·safe-area 패딩 등)를 고치면 그 복제본은 안 따라와 서서히 어긋나는 문제가 있었다
// (코드 리뷰 지적).
export type TabItem =
  | { label: string; icon: TabIcon; href: string }
  | { label: string; icon: TabIcon; onClick: () => void; active: boolean };

export function BottomTabBar({ items }: { items: TabItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-10 flex shrink-0 items-stretch border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const isActive =
          "href" in item
            ? pathname === item.href || pathname.startsWith(`${item.href}/`)
            : item.active;
        const Icon = item.icon;
        const className = `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
          isActive ? "text-primary" : "text-muted-foreground"
        }`;
        if ("href" in item) {
          return (
            <Link key={item.href} href={item.href} className={className}>
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        }
        return (
          <button key={item.label} type="button" onClick={item.onClick} className={className}>
            <Icon className="h-5 w-5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
