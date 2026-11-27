"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, FileText, Image as ImageIcon, Megaphone, Mic, Paperclip, Smartphone, Video } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { formatClock, formatDayLabel, formatPhone, initials, isSameDay } from "@/lib/format";
import { responseStatus, type Thresholds } from "@/lib/response-time";
import { subscribeWithAuth } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";
import { AssignSelect, StageSelect } from "@/components/contacts/contact-controls";
import { DealButtons } from "@/components/deals/deal-dialog";
import type { Member, Stage } from "@/lib/workspace-data";
import { ResponseBadge } from "./response-badge";
import { MESSAGE_COLUMNS, type InboxContact, type InboxMessage } from "./types";

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

export function ConversationView({
  slug,
  initialContact,
  initialMessages,
  stages,
  members,
  canAssign,
  numberLabel,
  thresholds,
}: {
  slug: string;
  initialContact: InboxContact;
  initialMessages: InboxMessage[];
  stages: Stage[];
  members: Member[];
  canAssign: boolean;
  numberLabel: string | null;
  thresholds: Thresholds;
}) {
  const [contact, setContact] = useState(initialContact);
  const [messages, setMessages] = useState(initialMessages);
  const now = useNow();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribeWithAuth(`conversation:${initialContact.id}`, (channel, supabase) =>
        channel
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages", filter: `contact_id=eq.${initialContact.id}` },
            async (payload) => {
              const { data } = await supabase
                .from("messages")
                .select(MESSAGE_COLUMNS)
                .eq("id", (payload.new as { id: string }).id)
                .single<InboxMessage>();
              if (!data) return;
              setMessages((current) =>
                current.some((m) => m.id === data.id)
                  ? current
                  : [...current, data].sort((a, b) => a.dikirim_pada.localeCompare(b.dikirim_pada)),
              );
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "messages", filter: `contact_id=eq.${initialContact.id}` },
            (payload) => {
              // Pesan diedit atau ditarik pengirimnya.
              const updated = payload.new as InboxMessage;
              setMessages((current) =>
                current.map((m) =>
                  m.id === updated.id
                    ? { ...m, isi: updated.isi, diedit_pada: updated.diedit_pada, dihapus_pada: updated.dihapus_pada }
                    : m,
                ),
              );
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "contacts", filter: `id=eq.${initialContact.id}` },
            (payload) => setContact(payload.new as InboxContact),
          ),
      ),
    [initialContact.id],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const name = contact.nama ?? formatPhone(contact.nomor_hp);

  return (
    <section aria-label="Percakapan" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/w/${slug}/inbox`}
            aria-label="Kembali ke daftar"
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e0f2f1] text-[15px] font-bold text-primary">
            {initials(name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-[17px] font-bold">{name}</h2>
            <span className="truncate text-[13px] text-muted-foreground">
              {formatPhone(contact.nomor_hp)}
              {numberLabel ? ` · via ${numberLabel}` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <StageSelect slug={slug} contactId={contact.id} value={contact.stage_id} stages={stages} />
          <AssignSelect
            slug={slug}
            contactId={contact.id}
            value={contact.assigned_to}
            members={members}
            canAssign={canAssign}
            className="self-center"
          />
          <Link
            href={`/w/${slug}/kontak/${contact.id}`}
            className="inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-semibold text-secondary-foreground hover:bg-muted"
          >
            Detail & catatan
          </Link>
          {stages.find((s) => s.id === contact.stage_id)?.tipe === "normal" && (
            <DealButtons slug={slug} contactId={contact.id} contactName={name} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-4 pt-4 sm:px-6">
        <div className="flex min-w-[260px] flex-[2] items-start gap-3 rounded-xl border bg-card px-3.5 py-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
              contact.sumber === "ctwa" ? "bg-[#eef4ff] text-[#1d4b8f]" : "bg-muted text-muted-foreground",
            )}
          >
            <Megaphone aria-hidden className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Atribusi (first-touch)</span>
            <span className="text-sm font-semibold">
              {contact.sumber === "ctwa" ? (contact.referral_headline ?? "Iklan tanpa judul") : "Organik / Tidak diketahui"}
            </span>
            <span className="text-xs text-muted-foreground">
              {contact.sumber === "ctwa" ? `ID iklan ${contact.ad_id}` : "Chat ini tidak membawa data referral iklan."}
            </span>
          </div>
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5 rounded-xl border bg-card px-3.5 py-3">
          <span className="text-xs text-muted-foreground">Waktu tanggapan</span>
          <span suppressHydrationWarning>
            <ResponseBadge status={responseStatus(contact, now, thresholds)} long />
          </span>
          <span className="text-xs text-muted-foreground">
            Batas: kuning {thresholds.kuning} mnt · merah {thresholds.merah} mnt
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((m, i) => {
          const out = m.arah === "keluar";
          const Icon = MEDIA_ICON[m.tipe] ?? Paperclip;
          const showDay = i === 0 || !isSameDay(messages[i - 1]!.dikirim_pada, m.dikirim_pada);
          return (
            <Fragment key={m.id}>
              {showDay && (
                <div className="self-center rounded-full bg-border px-3 py-1 text-xs text-secondary-foreground" suppressHydrationWarning>
                  {formatDayLabel(m.dikirim_pada, new Date(now))}
                </div>
              )}
              <div className={cn("flex", out ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "flex max-w-[78%] flex-col gap-1.5 rounded-2xl border px-3 py-2.5 text-sm leading-relaxed",
                    out ? "rounded-br-sm border-[#bfe3dc] bg-[#d9f0ec]" : "rounded-bl-sm bg-card",
                  )}
                >
                  {m.dihapus_pada ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground italic">
                      <Ban aria-hidden className="size-4" />
                      Pesan dihapus
                    </span>
                  ) : (
                    <>
                  {MEDIA_LABEL[m.tipe] && (
                    <span className="flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-[13px] text-secondary-foreground">
                      <Icon aria-hidden className="size-[18px]" />
                      {m.nama_file ?? MEDIA_LABEL[m.tipe]}
                      <span className="text-xs text-muted-foreground">· pratinjau menyusul</span>
                    </span>
                  )}
                  {m.isi && <span className="whitespace-pre-line">{m.isi}</span>}
                  {!m.isi && !MEDIA_LABEL[m.tipe] && <span className="text-muted-foreground italic">Pesan {m.tipe}</span>}
                    </>
                  )}
                  <span className={cn("text-[11px] text-muted-foreground", out ? "self-end" : "self-start")}>
                    {out ? "CS · dari HP · " : ""}
                    {formatClock(m.dikirim_pada)}
                    {m.diedit_pada && !m.dihapus_pada ? " · diedit" : ""}
                    {m.dari_history ? " · riwayat" : ""}
                  </span>
                </div>
              </div>
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mx-4 mb-5 flex items-center gap-3 rounded-xl border border-dashed border-[#98a2b3] bg-card px-4 py-3 text-[13px] text-secondary-foreground sm:mx-6">
        <Smartphone aria-hidden className="size-5 shrink-0" />
        CS membalas dari aplikasi WhatsApp Business di HP. Balasannya otomatis muncul di sini.
      </div>
    </section>
  );
}
