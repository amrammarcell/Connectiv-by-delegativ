"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { formatListTime, formatPhone, initials } from "@/lib/format";
import { responseStatus, type Thresholds } from "@/lib/response-time";
import { subscribeWithAuth } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";
import { ResponseBadge, SourceBadge } from "./response-badge";
import type { InboxContact, Lookup } from "./types";

type Filter = "semua" | "belum" | "iklan";

function byLatest(a: InboxContact, b: InboxContact) {
  return (b.pesan_terakhir_pada ?? "").localeCompare(a.pesan_terakhir_pada ?? "");
}

export function InboxList({
  slug,
  workspaceId,
  initialContacts,
  numbers,
  thresholds,
}: {
  slug: string;
  workspaceId: string;
  initialContacts: InboxContact[];
  numbers: Lookup;
  thresholds: Thresholds;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [numberFilter, setNumberFilter] = useState("");
  const now = useNow();
  const { contactId } = useParams<{ contactId?: string }>();

  // Realtime: kontak baru dan perubahan pesan terakhir langsung muncul.
  // RLS berlaku, jadi CS hanya menerima kontak miliknya.
  useEffect(
    () =>
      subscribeWithAuth(`inbox:${workspaceId}`, (channel) =>
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${workspaceId}` },
          (payload) => {
            setContacts((current) => {
              if (payload.eventType === "DELETE") return current.filter((c) => c.id !== (payload.old as { id: string }).id);
              const row = payload.new as InboxContact;
              if (!row.pesan_terakhir_pada) return current;
              return [row, ...current.filter((c) => c.id !== row.id)].sort(byLatest);
            });
          },
        ),
      ),
    [workspaceId],
  );

  const waitingCount = contacts.filter((c) => c.menunggu_balasan_sejak).length;
  const adCount = contacts.filter((c) => c.sumber === "ctwa").length;

  const visible = useMemo(() => {
    let list = contacts;
    if (filter === "belum") {
      list = list
        .filter((c) => c.menunggu_balasan_sejak)
        .sort((a, b) => a.menunggu_balasan_sejak!.localeCompare(b.menunggu_balasan_sejak!));
    }
    if (filter === "iklan") list = list.filter((c) => c.sumber === "ctwa");
    if (numberFilter) list = list.filter((c) => c.wa_number_id_terakhir === numberFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, "");
      list = list.filter((c) => (c.nama ?? "").toLowerCase().includes(q) || (qDigits && c.nomor_hp.includes(qDigits)));
    }
    return list;
  }, [contacts, filter, numberFilter, query]);

  const filters: { key: Filter; label: string }[] = [
    { key: "semua", label: `Semua (${contacts.length})` },
    { key: "belum", label: `Belum dibalas (${waitingCount})` },
    { key: "iklan", label: `Dari iklan (${adCount})` },
  ];

  return (
    <section
      aria-label="Daftar percakapan"
      className={cn(
        "flex min-h-0 flex-col border-r bg-card md:w-[380px] md:shrink-0",
        contactId ? "hidden md:flex" : "flex flex-1",
      )}
    >
      <div className="flex flex-col gap-3 border-b p-4">
        <label className="flex min-h-11 items-center gap-2 rounded-[10px] border border-input px-3 text-muted-foreground focus-within:border-ring">
          <Search aria-hidden className="size-[18px]" />
          <span className="sr-only">Cari nama atau nomor</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama atau nomor"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
          />
        </label>
        <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-[13px] font-semibold",
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-secondary-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {Object.keys(numbers).length > 1 && (
          <select
            aria-label="Filter nomor WhatsApp"
            value={numberFilter}
            onChange={(e) => setNumberFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm"
          >
            <option value="">Semua nomor WhatsApp</option>
            {Object.entries(numbers).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((c) => {
          const name = c.nama ?? formatPhone(c.nomor_hp);
          const active = c.id === contactId;
          return (
            <li key={c.id}>
              <Link
                href={`/w/${slug}/inbox/${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex gap-3 border-b border-muted px-4 py-3.5 hover:bg-accent/60",
                  active && "bg-accent",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e0f2f1] text-sm font-bold text-primary">
                  {initials(name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{name}</span>
                    {c.pesan_terakhir_pada && (
                      <span className="text-xs whitespace-nowrap text-muted-foreground" suppressHydrationWarning>
                        {formatListTime(c.pesan_terakhir_pada, new Date(now))}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {c.arah_pesan_terakhir === "keluar" ? "CS: " : ""}
                    {c.pesan_terakhir_cuplikan}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5" suppressHydrationWarning>
                    <ResponseBadge status={responseStatus(c, now, thresholds)} />
                    <SourceBadge sumber={c.sumber} headline={c.referral_headline} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {!visible.length && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            {contacts.length ? "Tidak ada percakapan yang cocok." : "Belum ada percakapan. Chat yang masuk akan muncul di sini."}
          </li>
        )}
      </ul>
    </section>
  );
}
