"use client";

import { useState } from "react";
import { Download, FileText, Image as ImageIcon, Mic, Paperclip, Video } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { InboxMessage } from "./types";

// Isi media dalam bubble chat. File dibuka lewat /api/media/<id> yang memeriksa
// akses lalu mengalihkan ke signed URL Storage (berlaku 1 jam).

export const MEDIA_TYPES = new Set(["image", "sticker", "video", "audio", "document", "media_placeholder"]);

const MEDIA_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  sticker: ImageIcon,
  video: Video,
  audio: Mic,
  document: FileText,
};

const MEDIA_LABEL: Record<string, string> = {
  image: "Gambar",
  sticker: "Stiker",
  video: "Video",
  audio: "Voice note",
  document: "Dokumen",
};

type MediaMessage = Pick<InboxMessage, "id" | "tipe" | "media_mime" | "nama_file" | "media_status" | "media_size">;

export function formatFileSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

function statusNote(status: InboxMessage["media_status"]): string {
  if (status === "tidak_tersedia") return "tidak tersedia";
  if (status === "gagal") return "belum bisa diunduh, dicoba lagi otomatis";
  return "sedang diunduh…";
}

function Placeholder({ message, note }: { message: MediaMessage; note: string }) {
  const Icon = MEDIA_ICON[message.tipe] ?? Paperclip;
  return (
    <span className="flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-[13px] text-secondary-foreground">
      <Icon aria-hidden className="size-[18px] shrink-0" />
      <span className="min-w-0 break-words">
        {message.nama_file ?? MEDIA_LABEL[message.tipe] ?? "Media"}
        <span className="text-xs text-muted-foreground"> · {note}</span>
      </span>
    </span>
  );
}

export function MessageMedia({ message }: { message: MediaMessage }) {
  const [broken, setBroken] = useState(false);
  const src = `/api/media/${message.id}`;

  // Riwayat chat: Meta hanya mengirim penanda; detail media bisa menyusul.
  if (message.tipe === "media_placeholder") {
    return <Placeholder message={message} note="media dari riwayat chat, belum tersedia" />;
  }
  if (message.media_status !== "tersimpan") {
    return <Placeholder message={message} note={statusNote(message.media_status)} />;
  }
  if (broken) return <Placeholder message={message} note="gagal dimuat, muat ulang halaman" />;

  const onError = () => setBroken(true);

  switch (message.tipe) {
    case "image":
      return (
        <Dialog>
          <DialogTrigger
            render={
              <button
                type="button"
                aria-label="Perbesar gambar"
                className="block overflow-hidden rounded-lg bg-black/5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL privat, tanpa optimasi Next */}
            <img
              src={src}
              alt="Gambar dari chat"
              loading="lazy"
              onError={onError}
              className="max-h-72 w-auto max-w-full object-contain"
            />
          </DialogTrigger>
          <DialogContent className="max-w-[calc(100%-2rem)] bg-black/90 p-2 sm:max-w-4xl">
            <DialogTitle className="sr-only">Gambar dari chat</DialogTitle>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL privat */}
            <img src={src} alt="Gambar dari chat" className="max-h-[85vh] w-full object-contain" />
            <a
              href={`${src}?download=1`}
              className="inline-flex items-center gap-1.5 justify-self-start rounded-md px-2 py-1 text-[13px] text-white/90 hover:bg-white/10"
            >
              <Download aria-hidden className="size-4" />
              Unduh
            </a>
          </DialogContent>
        </Dialog>
      );
    case "sticker":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- signed URL privat
        <img src={src} alt="Stiker" loading="lazy" onError={onError} className="size-32 object-contain" />
      );
    case "audio":
      return (
        <audio controls preload="none" src={src} onError={onError} className="h-10 w-72 max-w-full">
          <a href={`${src}?download=1`}>Unduh voice note</a>
        </audio>
      );
    case "video":
      return (
        <video
          controls
          preload="metadata"
          playsInline
          src={src}
          onError={onError}
          className="max-h-80 w-auto max-w-full rounded-lg bg-black"
        />
      );
    default: {
      const size = formatFileSize(message.media_size);
      const ext = message.nama_file?.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toUpperCase();
      return (
        <a
          href={`${src}?download=1`}
          className="flex items-center gap-3 rounded-lg bg-black/5 px-3 py-2.5 text-[13px] text-secondary-foreground hover:bg-black/10"
        >
          <FileText aria-hidden className="size-6 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold break-words">{message.nama_file ?? MEDIA_LABEL[message.tipe] ?? "File"}</span>
            <span className="text-xs text-muted-foreground">{[ext, size].filter(Boolean).join(" · ") || "Unduh"}</span>
          </span>
          <Download aria-hidden className="ml-auto size-4 shrink-0" />
        </a>
      );
    }
  }
}
