"use client";

import { useParams } from "next/navigation";
import { Eye } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

// Di HP, header "Inbox" disembunyikan saat percakapan terbuka supaya chat
// mendapat ruang penuh (header percakapan punya tombol kembali).
export function InboxHeader() {
  const { contactId } = useParams<{ contactId?: string }>();
  return (
    <div className={cn(contactId && "hidden md:block")}>
      <PageHeader title="Inbox">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
          <Eye aria-hidden className="size-3.5" />
          Mirroring · hanya baca
        </span>
      </PageHeader>
    </div>
  );
}
