"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addAdAccount, syncAdAccountNow } from "./actions";

export type AdAccountItem = {
  id: string;
  meta_ad_account_id: string;
  nama: string | null;
  status_sync: "belum" | "ok" | "gagal";
  terakhir_sync_pada: string | null;
  error_terakhir: string | null;
  workspace: string;
};

export function AddAdAccountForm({ workspaces }: { workspaces: { id: string; nama: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAdAccount, {});
  return (
    <>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-workspace">Workspace</Label>
          <NativeSelect id="ad-workspace" name="workspaceId" required className="h-10">
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nama}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="metaAdAccountId">ID ad account</Label>
          <Input id="metaAdAccountId" name="metaAdAccountId" required placeholder="act_1234567890" className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ad-nama">Nama (opsional)</Label>
          <Input id="ad-nama" name="nama" maxLength={80} placeholder="Ads Sobatimport" className="h-10" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? "Menyimpan…" : "Tambah ad account"}
          </Button>
        </div>
      </form>
      <FormMessage state={state} className="mt-3" />
    </>
  );
}

const STATUS_LABEL = { belum: "Belum sync", ok: "OK", gagal: "Gagal" } as const;

export function AdAccountRow({ account }: { account: AdAccountItem }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  return (
    <li className="flex flex-col gap-1.5 border-t px-5 py-3.5 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-semibold">{account.nama ?? account.meta_ad_account_id}</span>
          <span className="text-xs text-muted-foreground">
            {account.meta_ad_account_id} · {account.workspace} · {STATUS_LABEL[account.status_sync]}
            {account.terakhir_sync_pada
              ? ` · terakhir ${new Date(account.terakhir_sync_pada).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Jakarta",
                })}`
              : ""}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => startTransition(async () => setState(await syncAdAccountNow(account.id)))}
        >
          {pending ? "Menyinkronkan…" : "Sync sekarang"}
        </Button>
      </div>
      {account.status_sync === "gagal" && account.error_terakhir && !state.success && (
        <p className="text-xs break-all text-destructive">{account.error_terakhir}</p>
      )}
      <FormMessage state={state} />
    </li>
  );
}
