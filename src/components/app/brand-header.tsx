import { GrandFoodMark } from "@/components/brand/grandfood-logo";

export function BrandHeader() {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-5 py-4">
      <GrandFoodMark className="h-7 w-7 rounded-lg" />
      <span className="text-sm font-extrabold text-foreground">GrandFood</span>
    </header>
  );
}
