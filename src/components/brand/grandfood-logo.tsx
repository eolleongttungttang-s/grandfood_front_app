export function GrandFoodMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <rect width="100" height="100" rx="23.6" fill="#F7F2EB" />
      <path
        d="M12 58 Q32 58 38 36 T62 46 Q72 58 88 58"
        fill="none"
        stroke="#B96843"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 70 H84 A34 34 0 0 1 16 70 Z" fill="#2E241F" />
    </svg>
  );
}

export function GrandFoodLogo({
  className,
  markClassName = "h-7 w-7",
  wordmarkClassName = "text-sm font-extrabold text-foreground",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <GrandFoodMark className={markClassName} />
      <span className={wordmarkClassName}>GrandFood</span>
    </div>
  );
}
