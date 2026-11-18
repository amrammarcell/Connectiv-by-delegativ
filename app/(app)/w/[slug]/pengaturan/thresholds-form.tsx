"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateThresholds } from "./actions";

export function ThresholdsForm({ slug, kuning, merah }: { slug: string; kuning: number; merah: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateThresholds.bind(null, slug), {});

  return (
    <section aria-labelledby="h-batas" className="rounded-xl border bg-card p-5">
      <h2 id="h-batas" className="text-base font-bold">
        Waktu tanggapan
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Warna status chat yang menunggu balasan di Inbox: hijau di bawah batas kuning, merah setelah batas merah.
      </p>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kuning">Kuning setelah (menit)</Label>
          <Input id="kuning" name="kuning" type="number" min={1} max={1440} defaultValue={kuning} required className="h-9 w-32" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="merah">Merah setelah (menit)</Label>
          <Input id="merah" name="merah" type="number" min={2} max={2880} defaultValue={merah} required className="h-9 w-32" />
        </div>
        <Button type="submit" disabled={pending} className="h-9">
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </form>
      <FormMessage state={state} className="mt-3" />
    </section>
  );
}
