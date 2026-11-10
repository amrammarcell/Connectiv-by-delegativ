"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { TempPasswordNotice } from "@/components/temp-password-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/text";
import { createWorkspace, type CreateWorkspaceState } from "./actions";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState<CreateWorkspaceState, FormData>(createWorkspace, {});
  const [nama, setNama] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <>
      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nama">Nama workspace</Label>
          <Input
            id="nama"
            name="nama"
            required
            maxLength={80}
            value={nama}
            onChange={(e) => {
              setNama(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
            placeholder="Butik Aisyah"
            className="h-10"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Alamat (slug)</Label>
          <div className="flex h-10 items-center rounded-lg border border-input bg-background pl-2.5 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <span className="text-muted-foreground">/w/</span>
            <input
              id="slug"
              name="slug"
              required
              maxLength={48}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
              className="h-full min-w-0 flex-1 bg-transparent pr-2.5 outline-none"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerEmail">Email Owner (klien)</Label>
          <Input id="ownerEmail" name="ownerEmail" type="email" required className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerNama">Nama Owner (opsional)</Label>
          <Input id="ownerNama" name="ownerNama" maxLength={80} className="h-10" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? "Membuat…" : "Buat workspace"}
          </Button>
        </div>
      </form>
      <FormMessage state={state} className="mt-3" />
      {state.created && (
        <div className="mt-3 flex flex-col gap-2">
          <p role="status" className="text-sm font-medium text-primary">
            Workspace {state.created.nama} dibuat.{" "}
            <Link href={`/w/${state.created.slug}/pengaturan`} className="font-semibold underline">
              Buka workspace
            </Link>
          </p>
          <TempPasswordNotice email={state.created.ownerEmail} tempPassword={state.created.tempPassword} />
        </div>
      )}
    </>
  );
}
