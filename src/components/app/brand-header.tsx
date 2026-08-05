import { ChevronLeft } from "lucide-react";

import { GrandFoodMark } from "@/components/brand/grandfood-logo";

export function BrandHeader({ onBack }: { onBack?: () => void }) {
  return (
    <header className="flex shrink-0 flex-col border-b border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-4">
        <GrandFoodMark className="h-7 w-7 rounded-lg" />
        <span className="text-sm font-extrabold text-foreground">GrandFood</span>
      </div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 border-t border-border px-5 py-3 text-base font-bold text-foreground active:bg-muted"
        >
          <ChevronLeft className="h-6 w-6" />
          뒤로가기
        </button>
      )}
    </header>
  );
}
