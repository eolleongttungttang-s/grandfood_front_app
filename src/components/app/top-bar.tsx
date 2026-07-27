import { GrandFoodMark } from "@/components/brand/grandfood-logo";

export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
      <div className="flex items-center gap-3">
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
