"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, MessagesSquare, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { EmptyState, InboxListSkeleton } from "@/components/states";
import { useNow } from "@/hooks/use-now";
import { formatListTime, formatPhone, initials } from "@/lib/format";
import {
  adLabel,
  advancedFilterCount,
  compareInbox,
  cursorOf,
  hasActiveFilters,
  inboxFiltersToQuery,
  inboxRpcArgs,
  isUnread,
  matchesInboxFilters,
  parseInboxFilters,
  type InboxFilters,
  type InboxTab,
} from "@/lib/inbox-filters";
import { responseStatus, type Thresholds } from "@/lib/response-time";
import { createClient } from "@/lib/supabase/client";
import { subscribeWithAuth } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";
import { NotificationToggle, showChatNotification } from "./notifications";
import { ResponseBadge, SourceBadge } from "./response-badge";
import { INBOX_PAGE_SIZE, type InboxContact, type Lookup } from "./types";

export type InboxRow = InboxContact & { dibaca_pada?: string | null };
export type InboxSummary = { total: number; menunggu: number; iklan: number; belum_dibaca: number };

type Option = { id: string; nama: string };

type ListState = { key: string; contacts: InboxContact[]; hasMore: boolean };

const selectClass = "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm";

export function InboxList({
  slug,
  workspaceId,
  initialContacts,
  initialSummary,
  numbers,
  stages,
  members,
  adNames,
  adIds,
  thresholds,
}: {
  slug: string;
  workspaceId: string;
  initialContacts: InboxRow[];
  initialSummary: InboxSummary | null;
  numbers: Lookup;
  stages: Option[];
  // Kosong untuk CS (CS hanya melihat kontak miliknya).
  members: Option[];
  adNames: Lookup;
  adIds: string[];
  thresholds: Thresholds;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { contactId } = useParams<{ contactId?: string }>();
  const filters = useMemo(() => parseInboxFilters(searchParams), [searchParams]);
  const key = inboxFiltersToQuery(filters);
  const now = useNow();
  const supabase = useMemo(() => createClient(), []);

  // Data awal dari server selalu tanpa filter (layout tidak menerima searchParams).
  const [list, setList] = useState<ListState>(() => ({
    key: "",
    contacts: initialContacts,
    hasMore: initialContacts.length >= INBOX_PAGE_SIZE,
  }));
  const [reads, setReads] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(initialContacts.map((c) => [c.id, c.dibaca_pada ?? null])),
  );
  const [summary, setSummary] = useState<InboxSummary | null>(initialSummary);
  const [loadingMore, setLoadingMore] = useState(false);
  // Error dicatat bersama key filter-nya, supaya error lama tidak menempel di filter baru.
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const error = failure?.key === key ? failure.message : null;
  const setError = useCallback((message: string | null) => setFailure(message ? { key, message } : null), [key]);
  const [showFilters, setShowFilters] = useState(() => advancedFilterCount(filters) > 0);
  const [query, setQuery] = useState(filters.q);
  const requestRef = useRef(0);

  const loading = list.key !== key && failure?.key !== key;

  const navigate = useCallback(
    (next: Partial<InboxFilters>) => {
      router.replace(`${pathname}${inboxFiltersToQuery({ ...filters, ...next })}`, { scroll: false });
    },
    [filters, pathname, router],
  );

  const fetchPage = useCallback(
    async (f: InboxFilters, after: InboxContact | null) => {
      const cursor = after ? cursorOf(after, f.tab) : null;
      const { data, error: rpcError } = await supabase.rpc("inbox_contacts", inboxRpcArgs(workspaceId, f, cursor, INBOX_PAGE_SIZE));
      if (rpcError) throw rpcError;
      return (data ?? []) as InboxRow[];
    },
    [supabase, workspaceId],
  );

  const rememberReads = useCallback((rows: InboxRow[]) => {
    setReads((current) => {
      const next = { ...current };
      for (const r of rows) if (!(r.id in next) || r.dibaca_pada) next[r.id] = r.dibaca_pada ?? next[r.id] ?? null;
      return next;
    });
  }, []);

  // Muat halaman pertama setiap kali filter di URL berubah (atau "Coba lagi").
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (list.key === key) return;
    const id = ++requestRef.current;
    fetchPage(filters, null).then(
      (rows) => {
        if (id !== requestRef.current) return;
        rememberReads(rows);
        setList({ key, contacts: rows, hasMore: rows.length >= INBOX_PAGE_SIZE });
      },
      () => {
        if (id === requestRef.current) setFailure({ key, message: "Daftar percakapan gagal dimuat. Periksa koneksi lalu coba lagi." });
      },
    );
  }, [key, list.key, filters, fetchPage, rememberReads, attempt]);

  async function loadMore() {
    if (loadingMore || !list.hasMore || loading) return;
    const last = list.contacts.at(-1);
    if (!last) return;
    setLoadingMore(true);
    const id = requestRef.current;
    try {
      const rows = await fetchPage(filters, last);
      if (id !== requestRef.current) return;
      rememberReads(rows);
      setList((current) => {
        const seen = new Set(current.contacts.map((c) => c.id));
        return {
          ...current,
          contacts: [...current.contacts, ...rows.filter((r) => !seen.has(r.id))],
          hasMore: rows.length >= INBOX_PAGE_SIZE,
        };
      });
    } catch {
      setError("Halaman berikutnya gagal dimuat. Coba lagi.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Gulir sampai bawah → muat halaman berikutnya.
  const sentinelRef = useRef<HTMLLIElement>(null);
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMoreRef.current();
    }, { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [list.hasMore, list.key]);

  // Pencarian: tulis ke URL setelah berhenti mengetik.
  useEffect(() => {
    if (query.trim() === filters.q.trim()) return;
    const t = setTimeout(() => navigate({ q: query.trim() }), 350);
    return () => clearTimeout(t);
  }, [query, filters.q, navigate]);

  const refreshSummary = useCallback(async () => {
    const { data } = await supabase.rpc("inbox_summary", { ws: workspaceId });
    const row = (data as InboxSummary[] | null)?.[0];
    if (row) setSummary({ total: Number(row.total), menunggu: Number(row.menunggu), iklan: Number(row.iklan), belum_dibaca: Number(row.belum_dibaca) });
  }, [supabase, workspaceId]);

  // Percakapan yang sedang dibuka dianggap sudah dibaca (ConversationView
  // mencatatnya ke database).
  // Saat pindah percakapan, yang baru ditinggalkan ditandai dibaca di daftar
  // (yang sedang dibuka memang tidak pernah ditampilkan sebagai belum dibaca).
  const [previousActive, setPreviousActive] = useState(contactId);
  if (previousActive !== contactId) {
    setPreviousActive(contactId);
    if (previousActive) setReads((current) => ({ ...current, [previousActive]: new Date().toISOString() }));
  }
  // Jumlah "belum dibaca" diperbarui setelah status baca tersimpan.
  useEffect(() => {
    const t = setTimeout(() => void refreshSummary(), 1500);
    return () => clearTimeout(t);
  }, [contactId, refreshSummary]);

  // Nilai terbaru untuk handler Realtime tanpa membuka ulang channel.
  const live = useRef({ filters, contactId, reads, slug, router, key });
  useEffect(() => {
    live.current = { filters, contactId, reads, slug, router, key };
  });
  const lastSeen = useRef(new Map<string, number>());
  useEffect(() => {
    for (const c of list.contacts) {
      const t = c.pesan_terakhir_pada ? Date.parse(c.pesan_terakhir_pada) : 0;
      if (t > (lastSeen.current.get(c.id) ?? 0)) lastSeen.current.set(c.id, t);
    }
  }, [list.contacts]);

  // Realtime: kontak baru dan pesan terakhir langsung muncul (RLS berlaku:
  // CS hanya menerima kontak miliknya). Juga memicu notifikasi browser.
  useEffect(() => {
    const mountedAt = Date.now();
    let summaryTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeWithAuth(`inbox:${workspaceId}`, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const { filters: f, contactId: active, reads: r } = live.current;
          clearTimeout(summaryTimer);
          summaryTimer = setTimeout(() => void refreshSummary(), 1500);

          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id: string }).id;
            setList((current) => ({ ...current, contacts: current.contacts.filter((c) => c.id !== id) }));
            return;
          }
          const row = payload.new as InboxContact;
          if (!row.pesan_terakhir_pada) return;

          const at = Date.parse(row.pesan_terakhir_pada);
          const previous = lastSeen.current.get(row.id) ?? mountedAt;
          lastSeen.current.set(row.id, Math.max(at, previous));
          const isNewIncoming = row.arah_pesan_terakhir === "masuk" && at > previous;
          const viewing = row.id === active && document.visibilityState === "visible";
          let readAt = r[row.id];
          if (viewing) {
            readAt = new Date().toISOString();
            setReads((current) => ({ ...current, [row.id]: readAt! }));
          }
          if (isNewIncoming && !viewing) {
            const name = row.nama ?? formatPhone(row.nomor_hp);
            showChatNotification({
              tag: row.id,
              title: name,
              body: row.pesan_terakhir_cuplikan ?? "Pesan baru",
              onClick: () => live.current.router.push(`/w/${live.current.slug}/inbox/${row.id}${live.current.key}`),
            });
          }

          setList((current) => {
            const rest = current.contacts.filter((c) => c.id !== row.id);
            if (!matchesInboxFilters(row, f, readAt)) return { ...current, contacts: rest };
            const sort = compareInbox(f.tab);
            // Baris di luar halaman yang sudah dimuat akan datang lewat paginasi.
            const last = rest.at(-1);
            if (current.hasMore && last && sort(row, last) > 0) return { ...current, contacts: rest };
            return { ...current, contacts: [...rest, row].sort(sort) };
          });
        },
      ),
    );
    return () => {
      clearTimeout(summaryTimer);
      unsubscribe();
    };
  }, [workspaceId, refreshSummary]);

  async function markAllRead() {
    const { error: rpcError } = await supabase.rpc("mark_all_contacts_read", { ws: workspaceId });
    if (rpcError) {
      setError("Gagal menandai semua sebagai dibaca.");
      return;
    }
    const stamp = new Date().toISOString();
    setReads((current) => Object.fromEntries([...Object.keys(current), ...list.contacts.map((c) => c.id)].map((id) => [id, stamp])));
    setSummary((s) => (s ? { ...s, belum_dibaca: 0 } : s));
    if (filters.tab === "baru") setList((current) => ({ ...current, contacts: [], hasMore: false }));
  }

  const tabs: { key: InboxTab; label: string; count?: number }[] = [
    { key: "semua", label: "Semua", count: summary?.total },
    { key: "baru", label: "Belum dibaca", count: summary?.belum_dibaca },
    { key: "belum", label: "Belum dibalas", count: summary?.menunggu },
    { key: "iklan", label: "Dari iklan", count: summary?.iklan },
  ];
  const advanced = advancedFilterCount(filters);
  const filtered = hasActiveFilters(filters);
  const adOptions = useMemo(
    () => adIds.map((id) => ({ id, nama: adLabel(id, null, adNames) })).sort((a, b) => a.nama.localeCompare(b.nama, "id")),
    [adIds, adNames],
  );

  return (
    <section
      aria-label="Daftar percakapan"
      className={cn(
        "flex min-h-0 min-w-0 flex-col border-r bg-card md:w-[380px] md:shrink-0",
        contactId ? "hidden md:flex" : "flex flex-1 md:flex-none",
      )}
    >
      <div className="flex flex-col gap-3 border-b p-3 sm:p-4">
        <div className="flex gap-2">
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-input px-3 text-muted-foreground focus-within:border-ring">
            <Search aria-hidden className="size-[18px] shrink-0" />
            <span className="sr-only">Cari nama atau nomor</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama atau nomor"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <button
            type="button"
            aria-expanded={showFilters}
            aria-controls="inbox-filter-panel"
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold",
              advanced ? "border-primary text-primary" : "border-input text-secondary-foreground",
            )}
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            Filter
            {advanced > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                {advanced}
              </span>
            )}
          </button>
        </div>

        <div role="group" aria-label="Tampilkan" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={filters.tab === t.key}
              onClick={() => navigate({ tab: t.key })}
              className={cn(
                "min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap",
                filters.tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-secondary-foreground",
              )}
            >
              {t.label}
              {t.count !== undefined && ` (${t.count.toLocaleString("id-ID")})`}
            </button>
          ))}
        </div>

        {showFilters && (
          <div id="inbox-filter-panel" className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-xl bg-muted/50 p-2.5">
            {Object.keys(numbers).length > 1 && (
              <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground">
                Nomor WhatsApp
                <select value={filters.nomor} onChange={(e) => navigate({ nomor: e.target.value })} className={selectClass}>
                  <option value="">Semua nomor</option>
                  {Object.entries(numbers).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {members.length > 0 && (
              <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground">
                CS
                <select value={filters.cs} onChange={(e) => navigate({ cs: e.target.value })} className={selectClass}>
                  <option value="">Semua CS</option>
                  <option value="tanpa">Belum di-assign</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={cn("flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground", !members.length && "col-span-2")}>
              Stage
              <select value={filters.stage} onChange={(e) => navigate({ stage: e.target.value })} className={selectClass}>
                <option value="">Semua stage</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground">
              Iklan
              <select value={filters.iklan} onChange={(e) => navigate({ iklan: e.target.value })} className={selectClass}>
                <option value="">Semua iklan</option>
                {adOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground">
              Pesan terakhir dari
              <input
                type="date"
                value={filters.dari}
                max={filters.sampai || undefined}
                onChange={(e) => navigate({ dari: e.target.value })}
                className={selectClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground">
              sampai
              <input
                type="date"
                value={filters.sampai}
                min={filters.dari || undefined}
                onChange={(e) => navigate({ sampai: e.target.value })}
                className={selectClass}
              />
            </label>
            {advanced > 0 && (
              <button
                type="button"
                onClick={() => navigate({ nomor: "", cs: "", stage: "", iklan: "", dari: "", sampai: "" })}
                className="col-span-2 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-primary hover:bg-card"
              >
                <X aria-hidden className="size-4" />
                Hapus filter
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <NotificationToggle />
          {!!summary?.belum_dibaca && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-secondary-foreground hover:bg-muted"
            >
              <CheckCheck aria-hidden className="size-4" />
              Tandai semua dibaca
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 border-b bg-[#fef3f2] px-4 py-3 text-[13px] text-[#b42318]">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (list.key !== key) setAttempt((n) => n + 1);
              else void loadMore();
            }}
            className="shrink-0 rounded-lg border border-[#fda29b] bg-card px-2.5 py-1 font-semibold"
          >
            Coba lagi
          </button>
        </div>
      )}

      {loading ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <InboxListSkeleton />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto" aria-busy={loadingMore}>
          {list.contacts.map((c) => {
            const name = c.nama ?? formatPhone(c.nomor_hp);
            const active = c.id === contactId;
            const unread = !active && isUnread(c, reads[c.id]);
            return (
              <li key={c.id}>
                <Link
                  href={`/w/${slug}/inbox/${c.id}${key}`}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex gap-3 border-b border-muted px-4 py-3.5 hover:bg-accent/60", active && "bg-accent")}
                >
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e0f2f1] text-sm font-bold text-primary">
                    {initials(name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", unread ? "font-bold" : "font-semibold")}>{name}</span>
                      {c.pesan_terakhir_pada && (
                        <span
                          className={cn("text-xs whitespace-nowrap", unread ? "font-semibold text-primary" : "text-muted-foreground")}
                          suppressHydrationWarning
                        >
                          {formatListTime(c.pesan_terakhir_pada, new Date(now))}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {c.arah_pesan_terakhir === "keluar" ? "CS: " : ""}
                        {c.pesan_terakhir_cuplikan}
                      </span>
                      {unread && (
                        <span className="size-2.5 shrink-0 rounded-full bg-primary">
                          <span className="sr-only">Belum dibaca</span>
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5" suppressHydrationWarning>
                      <ResponseBadge status={responseStatus(c, now, thresholds)} />
                      <SourceBadge sumber={c.sumber} label={adLabel(c.ad_id, c.referral_headline, adNames)} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {!list.contacts.length && !error && (
            <li>
              {filtered ? (
                <EmptyState icon={SearchX} title="Tidak ada percakapan yang cocok">
                  <p>Coba ubah kata kunci atau filter.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      router.replace(pathname, { scroll: false });
                    }}
                    className="mt-3 min-h-9 rounded-lg border px-3 font-semibold text-secondary-foreground hover:bg-muted"
                  >
                    Tampilkan semua
                  </button>
                </EmptyState>
              ) : (
                <EmptyState icon={MessagesSquare} title="Belum ada percakapan">
                  Chat yang masuk ke nomor WhatsApp CS akan muncul di sini secara otomatis.
                </EmptyState>
              )}
            </li>
          )}
          {list.hasMore && (
            <li ref={sentinelRef} className="flex justify-center p-3">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="min-h-9 rounded-lg border px-3 text-[13px] font-semibold text-secondary-foreground hover:bg-muted disabled:opacity-60"
              >
                {loadingMore ? "Memuat…" : "Muat lebih banyak"}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

