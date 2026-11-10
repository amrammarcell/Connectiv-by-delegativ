import { cn } from "@/lib/utils";

export function Brand({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-8 items-center justify-center rounded-[9px] bg-sidebar-primary text-[17px] font-bold text-sidebar-primary-foreground">
        C
      </div>
      <span
        className={cn(
          "text-lg font-bold tracking-tight",
          tone === "dark" ? "text-white" : "text-foreground",
        )}
      >
        Connectiv
      </span>
    </div>
  );
}
