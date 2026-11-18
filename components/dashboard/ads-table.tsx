"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdMetrics } from "@/lib/dashboard";
import { formatRupiah } from "@/lib/deals";
import { cn } from "@/lib/utils";

type SortKey = "biayaPerClosing" | "roas" | "biayaPerChat" | "spend";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "biayaPerClosing", label: "Biaya / closing" },
  { key: "roas", label: "ROAS" },
  { key: "biayaPerChat", label: "Biaya / chat" },
  { key: "spend", label: "Spend" },
];

const money = (v: number | null) => (v === null ? "—" : formatRupiah(v));

export function AdsTable({ rows }: { rows: AdMetrics[] }) {
  const [sort, setSort] = useState<SortKey>("biayaPerClosing");
  const ads = rows.filter((r) => r.meta_ad_id);
  const organic = rows.find((r) => !r.meta_ad_id);

  const sorted = [...ads].sort((a, b) => {
    const av = a[sort];
    const bv = b[sort];
    if (av === null) return 1;
    if (bv === null) return -1;
    // ROAS dan spend: besar dulu; biaya: murah dulu.
    return sort === "roas" || sort === "spend" ? bv - av : av - bv;
  });

  const closingCosts = ads.map((a) => a.biayaPerClosing).filter((v): v is number => v !== null);
  const best = closingCosts.length > 1 ? Math.min(...closingCosts) : null;
  const worst = closingCosts.length > 1 ? Math.max(...closingCosts) : null;

  return (
    <section aria-labelledby="h-iklan" className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 id="h-iklan" className="text-base font-bold">
            Performa per iklan
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Atribusi first-touch · chat dan closing dari kontak yang masuk di periode ini
          </p>
        </div>
        <div role="group" aria-label="Urutkan" className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Urutkan</span>
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={sort === s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-semibold",
                sort === s.key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-secondary-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Iklan</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Chat</TableHead>
              <TableHead className="text-right">Closing</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Biaya / chat</TableHead>
              <TableHead className="text-right font-bold text-foreground">Biaya / closing</TableHead>
              <TableHead className="pr-5 text-right">ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.meta_ad_id}>
                <TableCell className="pl-5">
                  <div className="flex flex-col">
                    <span className="font-semibold">{r.nama_iklan ?? `Iklan ${r.meta_ad_id}`}</span>
                    <span className="text-xs text-muted-foreground">{r.nama_campaign ?? `ID ${r.meta_ad_id}`}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{money(r.spend || null)}</TableCell>
                <TableCell className="text-right">{r.chat}</TableCell>
                <TableCell className="text-right">{r.closing}</TableCell>
                <TableCell className="text-right">{money(r.revenue || null)}</TableCell>
                <TableCell className="text-right">{money(r.biayaPerChat)}</TableCell>
                <TableCell className="text-right">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 font-bold",
                      r.biayaPerClosing !== null && r.biayaPerClosing === best && "bg-[#ecfdf3] text-[#05603a]",
                      r.biayaPerClosing !== null && r.biayaPerClosing === worst && "bg-[#fef3f2] text-[#b42318]",
                    )}
                  >
                    {money(r.biayaPerClosing)}
                  </span>
                </TableCell>
                <TableCell className="pr-5 text-right font-semibold">
                  {r.roas === null ? "—" : `${r.roas.toLocaleString("id-ID", { maximumFractionDigits: 1 })}x`}
                </TableCell>
              </TableRow>
            ))}
            {organic && (
              <TableRow className="text-muted-foreground">
                <TableCell className="pl-5">
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">Organik / Tidak diketahui</span>
                    <span className="text-xs">Chat tanpa data referral iklan</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">{organic.chat}</TableCell>
                <TableCell className="text-right">{organic.closing}</TableCell>
                <TableCell className="text-right">{money(organic.revenue || null)}</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="pr-5 text-right">—</TableCell>
              </TableRow>
            )}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Belum ada data di periode ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
