"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ban, History, Megaphone, Smartphone } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { formatClock, formatDayLabel, formatPhone, initials, isSameDay } from "@/lib/format";
import { responseStatus, type Thresholds } from "@/lib/response-time";
import { createClient } from "@/lib/supabase/client";
import { subscribeWithAuth } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";
import { AssignSelect, StageSelect } from "@/components/contacts/contact-controls";
import { DealButtons } from "@/components/deals/deal-dialog";
import type { Member, Stage } from "@/lib/workspace-data";
import { MEDIA_TYPES, MessageMedia } from "./message-media";
import { ResponseBadge } from "./response-badge";
import { MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE, type InboxContact, type InboxMessage } from "./types";

export function ConversationView({
  slug,
  userId,
  initialContact,
  initialMessages,
  initialHasOlder,
  stages,
  members,
  canAssign,
  numberLabel,
  adName,
  thresholds,
}: {
  slug: string;
  userId: string;
  initialContact: InboxContact;
  initialMessages: InboxMessage[];
  initialHasOlder: boolean;
  stages: Stage[];
  members: Member[];
  canAssign: boolean;
  numberLabel: string | null;
  // Nama iklan (Meta → headline referral → id); null untuk organik.
  adName: string | null;
  thresholds: Thresholds;
}) {
  const [contact, setContact] = useState(initialContact);
  const [messages, setMessages] = useState(initialMessages);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [olderState, setOlderState] = useState<"idle" | "loading" | "error">("idle");
  const now = useNow();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tinggi isi sebelum pesan lama disisipkan, untuk menjaga posisi gulir.
  const prependFrom = useRef<number | null>(null);
  const searchParams = useSearchParams();
  const listQuery = searchParams.size ? `?${searchParams.toString()}` : "";
  const supabase = useMemo(() => createClient(), []);

  // Catat "sudah dibaca" saat percakapan dibuka, saat pesan masuk baru
  // diterima sementara tab terlihat, dan saat tab kembali terlihat.
  const lastIncoming = [...messages].reverse().find((m) => m.arah === "masuk")?.dikirim_pada ?? null;
  useEffect(() => {
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      // Query builder Supabase baru dikirim saat di-then/await.
      supabase
        .from("contact_reads")
        .upsert({ user_id: userId, contact_id: initialContact.id, workspace_id: initialContact.workspace_id, dibaca_pada: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.error("contact_reads", error.message);
        });
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [supabase, userId, initialContact.id, initialContact.workspace_id, lastIncoming]);

  async function loadOlder() {
    const first = messages[0];
    if (!first || olderState === "loading") return;
    setOlderState("loading");
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("contact_id", initialContact.id)
      // Kursor (waktu, id): pesan riwayat bisa punya waktu kirim yang sama.
      .or(`dikirim_pada.lt."${first.dikirim_pada}",and(dikirim_pada.eq."${first.dikirim_pada}",id.lt.${first.id})`)
      .order("dikirim_pada", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1)
      .returns<InboxMessage[]>();
    if (error) {
      setOlderState("error");
      return;
    }
    const rows = data ?? [];
    prependFrom.current = scrollRef.current?.scrollHeight ?? null;
    setHasOlder(rows.length > MESSAGE_PAGE_SIZE);
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      return [...rows.slice(0, MESSAGE_PAGE_SIZE).reverse().filter((m) => !seen.has(m.id)), ...current];
    });
    setOlderState("idle");
  }

  // Setelah pesan lama disisipkan di atas, pertahankan pesan yang sedang dilihat.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prependFrom.current !== null) {
      el.scrollTop += el.scrollHeight - prependFrom.current;
      prependFrom.current = null;
    }
  }, [messages]);

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
              // Pesan diedit atau ditarik pengirimnya, atau medianya selesai diunduh.
              const updated = payload.new as InboxMessage;
              setMessages((current) =>
                current.map((m) =>
                  m.id === updated.id
                    ? {
                        ...m,
                        tipe: updated.tipe,
                        isi: updated.isi,
                        diedit_pada: updated.diedit_pada,
                        dihapus_pada: updated.dihapus_pada,
                        media_mime: updated.media_mime,
                        nama_file: updated.nama_file,
                        media_status: updated.media_status,
                        media_size: updated.media_size,
                      }
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

  // Gulir ke bawah saat dibuka dan saat pesan terbaru bertambah (bukan saat
  // pesan lama dimuat).
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  const name = contact.nama ?? formatPhone(contact.nomor_hp);

  return (
    <section aria-label="Percakapan" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex flex-col gap-2.5 border-b bg-card px-3 py-2.5 sm:px-6 sm:py-3.5 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-3">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Link
            href={`/w/${slug}/inbox${listQuery}`}
            aria-label="Kembali ke daftar"
            className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e0f2f1] text-[15px] font-bold text-primary sm:size-11">
            {initials(name)}
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate text-base font-bold sm:text-[17px]">{name}</h2>
            <span className="truncate text-[13px] text-muted-foreground">
              {formatPhone(contact.nomor_hp)}
              {numberLabel ? ` · via ${numberLabel}` : ""}
            </span>
          </div>
        </div>
        {/* HP: kontrol dalam satu baris yang bisa digeser. */}
        <div className="-mx-3 flex items-start gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
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
            className="inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-semibold whitespace-nowrap text-secondary-foreground hover:bg-muted"
          >
            Detail & catatan
          </Link>
          {stages.find((s) => s.id === contact.stage_id)?.tipe === "normal" && (
            <DealButtons slug={slug} contactId={contact.id} contactName={name} />
          )}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto px-3 pt-3 [scrollbar-width:none] sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:overflow-visible sm:px-6 sm:pt-4 [&>*]:shrink-0">
        <div className="flex w-[80%] items-start gap-3 rounded-xl border bg-card px-3.5 py-3 sm:w-auto">
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
            <span className="text-sm font-semibold">{adName ?? "Organik / Tidak diketahui"}</span>
            <span className="text-xs break-all text-muted-foreground">
              {contact.sumber === "ctwa" ? `ID iklan ${contact.ad_id ?? "—"}` : "Chat ini tidak membawa data referral iklan."}
            </span>
          </div>
        </div>
        <div className="flex w-[64%] min-w-0 flex-col gap-1.5 rounded-xl border bg-card px-3.5 py-3 sm:w-auto">
          <span className="text-xs text-muted-foreground">Waktu tanggapan</span>
          <span suppressHydrationWarning className="min-w-0 [&>span]:whitespace-normal">
            <ResponseBadge status={responseStatus(contact, now, thresholds)} long />
          </span>
          <span className="text-xs text-muted-foreground">
            Batas: kuning {thresholds.kuning} mnt · merah {thresholds.merah} mnt
          </span>
        </div>
      </div>

      {/* overflow-wrap diwariskan ke gelembung: URL/kata panjang dipatahkan, tidak membuat gulir horizontal. */}
      <div
        ref={scrollRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto px-3 py-4 [overflow-wrap:anywhere] sm:px-6 sm:py-5"
      >
        {hasOlder && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={olderState === "loading"}
            className="inline-flex min-h-9 items-center gap-1.5 self-center rounded-full border bg-card px-3.5 text-[13px] font-semibold text-secondary-foreground hover:bg-muted disabled:opacity-60"
          >
            <History aria-hidden className="size-4" />
            {olderState === "loading" ? "Memuat…" : olderState === "error" ? "Gagal memuat, coba lagi" : "Muat pesan lama"}
          </button>
        )}
        {!hasOlder && messages.length > 0 && (
          <p className="self-center text-xs text-muted-foreground">Awal percakapan yang tersimpan</p>
        )}
        {!messages.length && (
          <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
            Belum ada pesan tersimpan untuk kontak ini. Pesan baru akan muncul di sini.
          </p>
        )}
        {messages.map((m, i) => {
          const out = m.arah === "keluar";
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
                  {MEDIA_TYPES.has(m.tipe) && <MessageMedia message={m} />}
                  {m.isi && <span className="whitespace-pre-line">{m.isi}</span>}
                  {!m.isi && !MEDIA_TYPES.has(m.tipe) && <span className="text-muted-foreground italic">Pesan {m.tipe}</span>}
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
