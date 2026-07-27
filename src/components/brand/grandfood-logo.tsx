export function GrandFoodMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#B96843" />
      <path
        d="M24 20 C22 17 26 15 24 12"
        stroke="#FFF6F0"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      <path
        d="M34 20 C32 17 36 15 34 12"
        stroke="#FFF6F0"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
      <path
        d="M13 29 C13 29 13 48 32 48 C51 48 51 29 51 29 C51 33.5 43.5 38 32 38 C20.5 38 13 33.5 13 29 Z"
        fill="#FFF6F0"
      />
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
