"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERAN_LABEL, type Peran } from "@/lib/types";
import { addWaNumber } from "./actions";

export type WorkspaceMember = { workspaceId: string; userId: string; nama: string; peran: Peran };

export function AddNumberForm({
  workspaces,
  members,
}: {
  workspaces: { id: string; nama: string }[];
  members: WorkspaceMember[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addWaNumber, {});
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const options = members.filter((m) => m.workspaceId === workspaceId);

  return (
    <>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workspaceId">Workspace</Label>
          <NativeSelect
            id="workspaceId"
            name="workspaceId"
            required
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="h-10"
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.nama}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label">Label</Label>
          <Input id="label" name="label" required maxLength={60} placeholder="CS 1 – Dewi" className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="csPemilik">CS pemilik (auto-assign)</Label>
          <NativeSelect id="csPemilik" name="csPemilik" key={workspaceId} defaultValue="" className="h-10">
            <option value="">Tidak ada</option>
            {options.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.nama} · {PERAN_LABEL[m.peran]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nomorTampil">Nomor (tampilan)</Label>
          <Input id="nomorTampil" name="nomorTampil" maxLength={30} placeholder="+62 812-..." className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phoneNumberId">Phone Number ID (Meta)</Label>
          <Input id="phoneNumberId" name="phoneNumberId" required inputMode="numeric" className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wabaId">WABA / Messaging account ID</Label>
          <Input id="wabaId" name="wabaId" required inputMode="numeric" className="h-10" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? "Menyimpan…" : "Tambah nomor"}
          </Button>
        </div>
      </form>
      <FormMessage state={state} className="mt-3" />
    </>
  );
}
