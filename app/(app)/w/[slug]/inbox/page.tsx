import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-background p-8 text-center md:flex">
      <MessagesSquare aria-hidden className="size-10 text-muted-foreground" />
      <p className="text-sm font-semibold">Pilih percakapan</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        Chat dari WhatsApp CS muncul otomatis di daftar sebelah kiri, lengkap dengan status waktu tanggapan.
      </p>
    </div>
  );
}
