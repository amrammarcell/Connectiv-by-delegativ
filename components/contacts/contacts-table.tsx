"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SourceBadge } from "@/components/inbox/response-badge";
import type { InboxContact, Lookup } from "@/components/inbox/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatListTime, formatPhone } from "@/lib/format";

export function ContactsTable({
  slug,
  contacts,
  stages,
  people,
}: {
  slug: string;
  contacts: InboxContact[];
  stages: Lookup;
  people: Lookup;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"" | "ctwa" | "organik">("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return contacts.filter(
      (c) =>
        (!source || c.sumber === source) &&
        (!q || (c.nama ?? "").toLowerCase().includes(q) || (qDigits !== "" && c.nomor_hp.includes(qDigits))),
    );
  }, [contacts, query, source]);

  return (
    <section aria-label="Daftar kontak" className="m-4 rounded-xl border bg-card sm:m-7">
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <label className="flex min-h-10 min-w-[240px] flex-1 items-center gap-2 rounded-[10px] border border-input px-3 text-muted-foreground focus-within:border-ring">
          <Search aria-hidden className="size-4" />
          <span className="sr-only">Cari nama atau nomor</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama atau nomor"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
          />
        </label>
        <select
          aria-label="Filter sumber"
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="h-10 rounded-lg border border-input bg-card px-2.5 text-sm"
        >
          <option value="">Semua sumber</option>
          <option value="ctwa">Dari iklan</option>
          <option value="organik">Organik</option>
        </select>
        <span className="text-[13px] text-muted-foreground">
          {visible.length} dari {contacts.length} kontak
        </span>
      </div>
      <div className="overflow-x-auto">
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
            {visible.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="pl-5">
                  <Link href={`/w/${slug}/kontak/${c.id}`} className="flex flex-col">
                    <span className="font-semibold text-foreground hover:underline">{c.nama ?? formatPhone(c.nomor_hp)}</span>
                    <span className="text-xs text-muted-foreground">{formatPhone(c.nomor_hp)}</span>
                  </Link>
                </TableCell>
                <TableCell>{c.stage_id ? stages[c.stage_id] : "—"}</TableCell>
                <TableCell>{c.assigned_to ? (people[c.assigned_to] ?? "—") : <span className="text-muted-foreground">Belum</span>}</TableCell>
                <TableCell>
                  <SourceBadge sumber={c.sumber} headline={c.referral_headline} />
                </TableCell>
                <TableCell className="pr-5 text-muted-foreground" suppressHydrationWarning>
                  {c.pesan_terakhir_pada ? formatListTime(c.pesan_terakhir_pada) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {contacts.length ? "Tidak ada kontak yang cocok." : "Belum ada kontak. Kontak dibuat otomatis saat chat pertama masuk."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
