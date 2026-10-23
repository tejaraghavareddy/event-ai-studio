import { cn } from "@/lib/utils";

/**
 * Celebré brand mark: an open champagne-gold ring (the "C") finished with a
 * small sparkle — the studio's shorthand for a celebration in progress.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <path
        d="M20.88 10.04A8.5 8.5 0 1 0 20.88 23.96"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M25 2.5C25.5 5.5 26.5 6.5 29.5 7C26.5 7.5 25.5 8.5 25 11.5C24.5 8.5 23.5 7.5 20.5 7C23.5 6.5 24.5 5.5 25 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Mark + wordmark lockup used in the app sidebar and the marketing nav. */
export function Brand({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark
        className={cn("text-gold", markClassName ?? "size-7")}
      />
      <span
        className={cn(
          "font-heading text-[1.15rem] font-bold tracking-tight text-foreground",
          wordmarkClassName,
        )}
      >
        Celebr
        <span className="text-gold">é</span>
      </span>
    </span>
  );
}
