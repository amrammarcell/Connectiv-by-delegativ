import { cn } from "@/lib/utils";

// Warna logo Connectiv: "C" navy dan titik coral.
export const LOGO_NAVY = "#0f1c3f";
export const LOGO_CORAL = "#ff5a4e";

// Logo: busur "C" dengan ujung membulat dan titik coral di celahnya.
// tone "dark" = di atas latar gelap (busur putih), "light" = latar terang (busur navy).
export function LogoMark({ className, tone = "light" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <svg viewBox="0 0 92 100" aria-hidden className={cn("size-8 shrink-0", className)}>
      <path
        d="M61.2 28.8 A30 30 0 1 0 61.2 71.2"
        fill="none"
        stroke={tone === "dark" ? "#ffffff" : LOGO_NAVY}
        strokeWidth="18"
        strokeLinecap="round"
      />
      <circle cx="78" cy="50" r="10" fill={LOGO_CORAL} />
    </svg>
  );
}

export function Brand({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} />
      <span className={cn("text-lg font-bold tracking-tight", tone === "dark" ? "text-white" : "text-foreground")}>
        Connectiv
      </span>
    </div>
  );
}
