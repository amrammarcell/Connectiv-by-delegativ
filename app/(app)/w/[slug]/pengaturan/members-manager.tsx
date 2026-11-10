"use client";

import { useActionState, useState, useTransition } from "react";
import { FormMessage } from "@/components/form-message";
import { NativeSelect } from "@/components/native-select";
import { TempPasswordNotice } from "@/components/temp-password-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERAN, PERAN_LABEL, type Peran } from "@/lib/types";
import { addMember, removeMember, updateMemberRole, type AddMemberState } from "./actions";

export type Member = { userId: string; peran: Peran; email: string; nama: string | null };

export function MembersManager({
  slug,
  members,
  currentUserId,
}: {
  slug: string;
  members: Member[];
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState<AddMemberState, FormData>(addMember.bind(null, slug), {});

  return (
    <div className="m-7 flex max-w-4xl flex-col gap-6">
      <section aria-labelledby="h-tambah" className="rounded-xl border bg-card p-5">
        <h2 id="h-tambah" className="text-base font-bold">
          Tambah user
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Akun baru mendapat password sementara. Sampaikan ke user secara langsung, lalu minta dia
          menggantinya lewat menu Ganti password.
        </p>
        <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required className="h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nama">Nama (opsional)</Label>
            <Input id="nama" name="nama" maxLength={80} className="h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="peran">Peran</Label>
            <NativeSelect id="peran" name="peran" defaultValue="cs">
              {PERAN.map((p) => (
                <option key={p} value={p}>
                  {PERAN_LABEL[p]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" disabled={pending} className="h-9">
            {pending ? "Menambah…" : "Tambah"}
          </Button>
        </form>
        <FormMessage state={state} className="mt-3" />
        {state.added && (
          <TempPasswordNotice email={state.added.email} tempPassword={state.added.tempPassword} className="mt-3" />
        )}
      </section>

      <section aria-labelledby="h-anggota" className="rounded-xl border bg-card">
        <h2 id="h-anggota" className="border-b px-5 py-4 text-base font-bold">
          Anggota ({members.length})
        </h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">User</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead className="pr-5 text-right">
                  <span className="sr-only">Aksi</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <MemberRow key={m.userId} slug={slug} member={m} isSelf={m.userId === currentUserId} />
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function MemberRow({ slug, member, isSelf }: { slug: string; member: Member; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError((await fn()).error);
    });

  return (
    <TableRow>
      <TableCell className="pl-5">
        <div className="flex flex-col">
          <span className="font-semibold">
            {member.nama ?? member.email}
            {isSelf && <span className="ml-1.5 text-xs font-medium text-muted-foreground">(Anda)</span>}
          </span>
          {member.nama && <span className="text-xs text-muted-foreground">{member.email}</span>}
          {error && (
            <span role="alert" className="text-xs font-medium text-destructive">
              {error}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <NativeSelect
          aria-label={`Peran ${member.email}`}
          value={member.peran}
          disabled={isSelf || pending}
          onChange={(e) => run(() => updateMemberRole(slug, member.userId, e.target.value as Peran))}
        >
          {PERAN.map((p) => (
            <option key={p} value={p}>
              {PERAN_LABEL[p]}
            </option>
          ))}
        </NativeSelect>
      </TableCell>
      <TableCell className="pr-5 text-right">
        {!isSelf && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            className="text-destructive"
            onClick={() => {
              if (confirm(`Hapus ${member.email} dari workspace ini?`)) {
                run(() => removeMember(slug, member.userId));
              }
            }}
          >
            Hapus
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
