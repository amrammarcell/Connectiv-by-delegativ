"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NumberWarning } from "@/lib/wa-health";
import { SUMBER_LABEL, type SyncSummary } from "@/lib/whatsapp/number-status";
import { retryNumberSync, updateWaNumber } from "./actions";

export type NumberRowView = {
  id: string;
  label: string;
  nomorTampil: string | null;
  csPemilik: string | null;
  status: string;
  sumber: string;
  pesanTerakhir: string | null;
  warnings: NumberWarning[];
  sync: SyncSummary;
};

export type MemberOption = { userId: string; nama: string };

export function NumbersTable({
  slug,
  numbers,
  members,
}: {
  slug: string;
  numbers: NumberRowView[];
  members: MemberOption[];
}) {
  if (!numbers.length) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
        Belum ada nomor WhatsApp di workspace ini.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {numbers.map((n) => (
        <NumberRow key={n.id} slug={slug} n={n} members={members} />
      ))}
    </ul>
  );
}

function NumberRow({ slug, n, members }: { slug: string; n: NumberRowView; members: MemberOption[] }) {
  const [state, action, saving] = useActionState<FormState, FormData>(updateWaNumber.bind(null, slug, n.id), {});
  const [syncState, setSyncState] = useState<FormState>({});
  const [retrying, startRetry] = useTransition();

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{n.nomorTampil ?? n.label}</span>
        <Badge variant={n.sumber === "resmi" ? "default" : "secondary"}>{SUMBER_LABEL[n.sumber] ?? n.sumber}</Badge>
        <span className={cn("text-sm font-semibold", n.status === "aktif" ? "text-primary" : "text-destructive")}>
          {n.status === "aktif" ? "Aktif" : "Terputus"}
        </span>
        <span className="text-xs text-muted-foreground">· Pesan terakhir {n.pesanTerakhir ?? "belum ada"}</span>
      </div>

      {n.warnings.map((w) => (
        <p key={w.text} className={cn("text-xs", w.level === "merah" ? "text-destructive" : "text-amber-700")}>
          ⚠ {w.text}
        </p>
      ))}

      {n.sync.level !== "netral" && (
        <div className="flex flex-wrap items-center gap-3">
          <p
            className={cn(
              "text-xs",
              n.sync.level === "ok" && "text-primary",
              n.sync.level === "proses" && "text-muted-foreground",
              n.sync.level === "gagal" && "text-destructive",
            )}
          >
            Sinkronisasi: {n.sync.text}
          </p>
          {n.sync.canRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retrying}
              onClick={() => startRetry(async () => setSyncState(await retryNumberSync(slug, n.id)))}
            >
              {retrying ? "Meminta…" : "Coba lagi"}
            </Button>
          )}
          <FormMessage state={syncState} className="text-xs" />
        </div>
      )}

      <form action={action} className="grid gap-3 sm:grid-cols-[1.2fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Label
          <Input name="label" defaultValue={n.label} required maxLength={60} className="h-9" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          CS pemilik
          <NativeSelect name="csPemilik" defaultValue={n.csPemilik ?? ""}>
            <option value="">Tidak ada</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.nama}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline" disabled={saving} className="h-9">
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
      </form>
      <FormMessage state={state} />
    </li>
  );
}
