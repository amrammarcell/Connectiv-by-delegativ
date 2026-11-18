import { Clock } from "lucide-react";
import { LEVEL_CLASS, type ResponseStatus } from "@/lib/response-time";
import { cn } from "@/lib/utils";

export function ResponseBadge({ status, long = false }: { status: ResponseStatus | null; long?: boolean }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        LEVEL_CLASS[status.level],
      )}
    >
      <Clock aria-hidden className="size-3" strokeWidth={2.5} />
      {long ? status.long : status.label}
    </span>
  );
}

export function SourceBadge({ sumber, headline }: { sumber: "ctwa" | "organik"; headline: string | null }) {
  return (
    <span
      className={cn(
        "max-w-[200px] truncate rounded-full px-2 py-0.5 text-xs",
        sumber === "ctwa" ? "bg-[#eef4ff] text-[#1d4b8f]" : "bg-muted text-muted-foreground",
      )}
    >
      {sumber === "ctwa" ? `Iklan · ${headline ?? "Tanpa judul"}` : "Organik"}
    </span>
  );
}
