import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, SearchX, Users } from "lucide-react";
import { FilterForm } from "@/components/filter-form";
import { SourceBadge } from "@/components/inbox/response-badge";
import type { InboxContact, Lookup } from "@/components/inbox/types";
import { EmptyState } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatListTime, formatPhone } from "@/lib/format";
import { adLabel } from "@/lib/inbox-filters";
import { cn } from "@/lib/utils";

export const CONTACTS_PAGE_SIZE = 50;

export type ContactFilters = { q: string; sumber: "" | "ctwa" | "organik"; stage: string; cs: string; iklan: string; hal: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseContactFilters(query: Record<string, string | string[] | undefined>): ContactFilters {
  const sumber = one(query.sumber);
  const cs = one(query.cs);
  const hal = Number.parseInt(one(query.hal), 10);
  return {
    q: one(query.q).trim().slice(0, 100),
    sumber: sumber === "ctwa" || sumber === "organik" ? sumber : "",
    stage: UUID.test(one(query.stage)) ? one(query.stage) : "",
    cs: cs === "tanpa" || UUID.test(cs) ? cs : "",
    iklan: /^[0-9A-Za-z_-]{1,64}$/.test(one(query.iklan)) ? one(query.iklan) : "",
    hal: Number.isFinite(hal) && hal > 0 ? Math.min(hal, 10_000) : 1,
  };
}

function hrefWith(slug: string, filters: ContactFilters, hal: number) {
  const params = new URLSearchParams();
  for (const key of ["q", "sumber", "stage", "cs", "iklan"] as const) if (filters[key]) params.set(key, filters[key]);
  if (hal > 1) params.set("hal", String(hal));
  const s = params.toString();
  return `/w/${slug}/kontak${s ? `?${s}` : ""}`;
}

const selectClass = "h-10 min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm";

export function ContactsTable({
  slug,
  contacts,
  total,
  filters,
  stages,
  stageOptions,
  people,
  members,
  adNames,
  adIds,
}: {
  slug: string;
  contacts: InboxContact[];
  total: number;
  filters: ContactFilters;
  stages: Lookup;
  stageOptions: { id: string; nama: string }[];
  people: Lookup;
  // Kosong untuk CS.
  members: { id: string; nama: string }[];
  adNames: Lookup;
  adIds: string[];
}) {
  const pages = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));
  const from = total ? (filters.hal - 1) * CONTACTS_PAGE_SIZE + 1 : 0;
  const to = Math.min(total, filters.hal * CONTACTS_PAGE_SIZE);
  const filtered = Boolean(filters.q || filters.sumber || filters.stage || filters.cs || filters.iklan);
  const ads = adIds.map((id) => ({ id, nama: adLabel(id, null, adNames) })).sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  return (
    <section aria-label="Daftar kontak" className="m-3 rounded-xl border bg-card sm:m-7">
      <FilterForm key={hrefWith(slug, filters, 1)} action={`/w/${slug}/kontak`} className="flex flex-col gap-3 border-b p-3 sm:p-4">
        <div className="flex gap-2">
          <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-input px-3 text-muted-foreground focus-within:border-ring">
            <Search aria-hidden className="size-4 shrink-0" />
            <span className="sr-only">Cari nama atau nomor</span>
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Cari nama atau nomor"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <button type="submit" className="min-h-10 shrink-0 rounded-[10px] bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground">
            Cari
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <select name="sumber" aria-label="Filter sumber" defaultValue={filters.sumber} className={selectClass}>
            <option value="">Semua sumber</option>
            <option value="ctwa">Dari iklan</option>
            <option value="organik">Organik</option>
          </select>
          <select name="stage" aria-label="Filter stage" defaultValue={filters.stage} className={selectClass}>
            <option value="">Semua stage</option>
            {stageOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
          {members.length > 0 && (
            <select name="cs" aria-label="Filter CS" defaultValue={filters.cs} className={selectClass}>
              <option value="">Semua CS</option>
              <option value="tanpa">Belum di-assign</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama}
                </option>
              ))}
            </select>
          )}
          {ads.length > 0 && (
            <select name="iklan" aria-label="Filter iklan" defaultValue={filters.iklan} className={cn(selectClass, "sm:max-w-64")}>
              <option value="">Semua iklan</option>
              {ads.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nama}
                </option>
              ))}
            </select>
          )}
          {filtered && (
            <Link
              href={`/w/${slug}/kontak`}
              className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-[13px] font-semibold text-primary hover:bg-muted"
            >
              Hapus filter
            </Link>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {total ? `${from.toLocaleString("id-ID")}–${to.toLocaleString("id-ID")} dari ${total.toLocaleString("id-ID")} kontak` : "0 kontak"}
        </p>
      </FilterForm>

      {!contacts.length ? (
        filtered ? (
          <EmptyState icon={SearchX} title="Tidak ada kontak yang cocok">
            Coba ubah kata kunci atau filter.
          </EmptyState>
        ) : (
          <EmptyState icon={Users} title="Belum ada kontak">
            Kontak dibuat otomatis saat chat pertama masuk ke nomor WhatsApp CS.
          </EmptyState>
        )
      ) : (
        <>
          {/* HP: daftar kartu */}
          <ul className="divide-y sm:hidden">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link href={`/w/${slug}/kontak/${c.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-accent/60">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{c.nama ?? formatPhone(c.nomor_hp)}</span>
                    <span className="text-xs whitespace-nowrap text-muted-foreground" suppressHydrationWarning>
                      {c.pesan_terakhir_pada ? formatListTime(c.pesan_terakhir_pada) : "—"}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatPhone(c.nomor_hp)} · {c.stage_id ? (stages[c.stage_id] ?? "—") : "Tanpa stage"} ·{" "}
                    {c.assigned_to ? (people[c.assigned_to] ?? "—") : "Belum di-assign"}
                  </span>
                  <SourceBadge sumber={c.sumber} label={adLabel(c.ad_id, c.referral_headline, adNames)} />
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet/laptop: tabel */}
          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Kontak</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>CS</TableHead>
                  <TableHead>Sumber</TableHead>
                  <TableHead className="pr-5">Pesan terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-5">
                      <Link href={`/w/${slug}/kontak/${c.id}`} className="flex flex-col">
                        <span className="font-semibold text-foreground hover:underline">{c.nama ?? formatPhone(c.nomor_hp)}</span>
                        <span className="text-xs text-muted-foreground">{formatPhone(c.nomor_hp)}</span>
                      </Link>
                    </TableCell>
                    <TableCell>{c.stage_id ? stages[c.stage_id] : "—"}</TableCell>
                    <TableCell>
                      {c.assigned_to ? (people[c.assigned_to] ?? "—") : <span className="text-muted-foreground">Belum</span>}
                    </TableCell>
                    <TableCell>
                      <SourceBadge sumber={c.sumber} label={adLabel(c.ad_id, c.referral_headline, adNames)} />
                    </TableCell>
                    <TableCell className="pr-5 text-muted-foreground" suppressHydrationWarning>
                      {c.pesan_terakhir_pada ? formatListTime(c.pesan_terakhir_pada) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {pages > 1 && (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3 border-t px-4 py-3 text-[13px]">
          <PageLink href={hrefWith(slug, filters, filters.hal - 1)} disabled={filters.hal <= 1}>
            <ChevronLeft aria-hidden className="size-4" />
            Sebelumnya
          </PageLink>
          <span className="text-muted-foreground">
            Halaman {filters.hal.toLocaleString("id-ID")} dari {pages.toLocaleString("id-ID")}
          </span>
          <PageLink href={hrefWith(slug, filters, filters.hal + 1)} disabled={filters.hal >= pages}>
            Berikutnya
            <ChevronRight aria-hidden className="size-4" />
          </PageLink>
        </nav>
      )}
    </section>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = "inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 font-semibold";
  if (disabled) {
    return (
      <span aria-disabled className={cn(className, "text-muted-foreground opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cn(className, "text-secondary-foreground hover:bg-muted")}>
      {children}
    </Link>
  );
}
